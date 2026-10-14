import dbus from 'dbus-next';
import type { MessageBus, Variant } from 'dbus-next';
import { BaseConfiguration, BaseTransport } from './types.js';

const DEVICE = 'org.bluez.Device1';
const GATT = 'org.bluez.GattCharacteristic1';
const PROPERTIES = 'org.freedesktop.DBus.Properties';
type ManagedObjects = Record<string, Record<string, Record<string, Variant>>>;

// Discover the paired base by address and UUID rather than firmware-specific handles.
export class BluezBaseTransport implements BaseTransport {
  private bus: MessageBus | null = null;
  private writePath: string | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private pending = new Set<(error: Error) => void>();
  private failConnection: ((error: Error) => void) | null = null;

  private async call(
    path: string,
    service: string,
    member: string,
    signature = '',
    body: unknown[] = [],
    destination = 'org.bluez',
  ) {
    const bus = this.bus;
    if (!bus) throw new Error('Bluetooth connection closed');
    return new Promise<unknown[]>((resolve, reject) => {
      const timer: { value?: ReturnType<typeof setTimeout> } = {};
      const fail = (error: Error) => {
        clearTimeout(timer.value);
        this.pending.delete(fail);
        reject(error);
      };
      timer.value = setTimeout(() => {
        const error = new Error(`Bluetooth ${member} timed out`);
        fail(error);
        this.failConnection?.(error);
      }, 8000);
      this.pending.add(fail);
      bus.call(new dbus.Message({ destination, path, interface: service, member, signature, body })).then((reply) => {
        clearTimeout(timer.value);
        this.pending.delete(fail);
        if (bus !== this.bus || !reply) return reject(new Error('Bluetooth connection closed'));
        resolve(reply.body as unknown[]);
      }, fail);
    });
  }

  async connect(configuration: BaseConfiguration, onData: (bytes: Uint8Array) => void, onError: (error: Error) => void) {
    this.close();
    const bus = dbus.systemBus({ negotiateUnixFd: false });
    this.bus = bus;
    const fail = (error: Error) => {
      if (this.bus !== bus) return;
      this.close();
      onError(error);
    };
    this.failConnection = fail;
    bus.on('error', fail);
    try {
      const daemon = '/org/freedesktop/DBus';
      const [owner] = await this.call(daemon, 'org.freedesktop.DBus', 'GetNameOwner', 's', ['org.bluez'], 'org.freedesktop.DBus');
      const discover = async () =>
        (await this.call('/', 'org.freedesktop.DBus.ObjectManager', 'GetManagedObjects'))[0] as ManagedObjects;
      let objects = await discover();
      const device = Object.keys(objects).find((path) => objects[path][DEVICE]?.Address?.value === configuration.Address);
      if (!device) throw new Error('Base is not paired in BlueZ. Complete stock base setup first.');
      let notifyPath = '';
      bus.on('message', (message) => {
        if (this.bus !== bus || message.type !== 4) return;
        if (message.sender === 'org.freedesktop.DBus' && message.member === 'NameOwnerChanged') {
          const [name, , replacement] = message.body;
          if (name === 'org.bluez' && replacement !== owner) fail(new Error('Bluetooth service restarted'));
        }
        if (message.sender !== owner || message.interface !== PROPERTIES || message.member !== 'PropertiesChanged') return;
        const [service, changes, invalidated] = message.body as [string, Record<string, Variant>, string[]];
        if (
          message.path === device &&
          service === DEVICE &&
          (changes.Connected?.value === false || invalidated.includes('Connected'))
        )
          fail(new Error('Base disconnected'));
        if (message.path !== notifyPath || service !== GATT) return;
        if (changes.Notifying?.value === false) return fail(new Error('Base notifications stopped'));
        const values: unknown = changes.Value?.value;
        if (Buffer.isBuffer(values)) onData(values);
        else if (Array.isArray(values) && values.every((value) => Number.isInteger(value) && value >= 0 && value <= 255)) {
          onData(Uint8Array.from(values));
        }
      });
      for (const rule of [
        `type='signal',sender='org.bluez',interface='${PROPERTIES}',path_namespace='${device}'`,
        "type='signal',sender='org.freedesktop.DBus',member='NameOwnerChanged',arg0='org.bluez'",
      ])
        await this.call(daemon, 'org.freedesktop.DBus', 'AddMatch', 's', [rule], 'org.freedesktop.DBus');
      if (!objects[device][DEVICE].Connected?.value) await this.call(device, DEVICE, 'Connect');
      const deadline = Date.now() + 8000;
      while (!objects[device]?.[DEVICE]?.ServicesResolved?.value) {
        if (Date.now() >= deadline) throw new Error('Base service discovery timed out');
        await new Promise((resolve) => setTimeout(resolve, 150));
        objects = await discover();
      }
      const locate = (shortUUID: string) => {
        const uuid = `0000${shortUUID}-0000-1000-8000-00805f9b34fb`;
        const matches = Object.keys(objects).filter(
          (path) => path.startsWith(device + '/') && objects[path][GATT]?.UUID?.value === uuid,
        );
        if (matches.length !== 1) throw new Error('Base characteristic missing or ambiguous');
        return matches[0];
      };
      notifyPath = locate('ffe1');
      const writePath = locate('ffe3');
      const flags: unknown = objects[writePath][GATT].Flags?.value;
      if (!Array.isArray(flags) || !flags.includes('write')) throw new Error('Base requires acknowledged GATT writes');
      await this.call(notifyPath, GATT, 'StartNotify');
      this.writePath = writePath;
      // Bounded reads detect a clean D-Bus socket EOF as well as missed disconnect signals.
      const heartbeat = async () => {
        try {
          const [connected] = await this.call(device, PROPERTIES, 'Get', 'ss', [DEVICE, 'Connected']);
          if (!(connected as Variant).value) throw new Error('Base disconnected');
          if (this.bus === bus)
            this.timer = setTimeout(() => {
              void heartbeat();
            }, 5000);
        } catch (error) {
          fail(error instanceof Error ? error : new Error('Bluetooth unavailable'));
        }
      };
      this.timer = setTimeout(() => {
        void heartbeat();
      }, 5000);
    } catch (error) {
      this.close();
      throw error;
    }
  }

  async write(bytes: Uint8Array) {
    if (!this.writePath) throw new Error('Bluetooth base is unavailable');
    await this.call(this.writePath, GATT, 'WriteValue', 'aya{sv}', [
      Array.from(bytes),
      { type: new dbus.Variant('s', 'request') },
    ]);
  }

  close() {
    const bus = this.bus;
    this.bus = null;
    this.writePath = null;
    this.failConnection = null;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    for (const fail of this.pending) fail(new Error('Bluetooth connection closed'));
    bus?.disconnect();
  }
}
