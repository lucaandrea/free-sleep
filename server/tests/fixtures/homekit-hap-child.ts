import { Bridge, Characteristic, Service, uuid } from 'hap-nodejs';
import { HomeKitBridgeController } from '../../src/integrations/homekit/controller.js';
import { runHomeKitWorker } from '../../src/integrations/homekit/workerRuntime.js';

// Exercise real characteristic handlers over real IPC, but never publish an accessory or open a HAP listener.
class TestBridge extends Bridge {
  override async publish() {
    this.emit('advertised');
    if (process.argv[2] === 'idle') return;
    setImmediate(() => {
      void (async () => {
        const left = this.bridgedAccessories[0].getService(Service.Thermostat)!;
        const [current, target] = await Promise.all([
          left.getCharacteristic(Characteristic.CurrentTemperature).handleGetRequest(),
          left.getCharacteristic(Characteristic.TargetTemperature).handleGetRequest(),
        ]);
        await left.getCharacteristic(Characteristic.TargetTemperature).handleSetRequest(20);
        const switchFor = (name: string) => this.bridgedAccessories.find(accessory => accessory.displayName === name)!
          .getService(Service.Switch)!.getCharacteristic(Characteristic.On);
        await Promise.all([switchFor('Bed read').handleSetRequest(true), switchFor('Stop bed movement').handleSetRequest(true)]);
        await switchFor('Prime Pod').handleSetRequest(true);
        process.stdout.write(JSON.stringify({ current, target, complete: true }) + '\n');
      })().catch(error => { process.stdout.write(JSON.stringify({ error: String(error) }) + '\n'); });
    });
  }
  override async unpublish() {}
  override setupURI() { return 'X-HM://TEST-ONLY'; }
}

runHomeKitWorker(options => new HomeKitBridgeController({ ...options,
  createBridge: identity => new TestBridge('Test HomeKit', uuid.generate(identity.id)) }));
