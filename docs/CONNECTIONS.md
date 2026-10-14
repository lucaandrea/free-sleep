# Connection and Apple Home setup

Web and native Settings now share the connection, Appearance, Apple Home, Apple Health and Shortcuts sections. iOS owns Health permissions and Home scenes; browser Settings explains where those native functions are available. The advanced device/diagnostic pages remain web-only.

## Test before saving

Enter the Pod or secure gateway origin and its connection token, then choose **Test connection**. This makes a read-only settings request with the entered credentials. It checks that the response is a Free Sleep settings object and shows the Pod identity and timezone. It does not move the bed, save credentials, verify the biometric stream, or establish Home pairing. Authentication, unavailable-Pod and malformed-response failures are shown explicitly.

**Save connection** remains available without a successful test, so an offline connection can be configured. iOS reports when those details have not been tested. Web saving reloads the app against the selected connection. Tokens stay in the browser tab's session storage or the iPhone Keychain. Model keys belong on the server. Editing the address clears the token field instead of carrying credentials to a new destination; the previous saved connection is preserved until Save succeeds.

Both clients reject paths, URL credentials, query strings and fragments. Remote connections require HTTPS. HTTP is limited to supported LAN IPv4 addresses, `.local`, localhost and loopback; an HTTPS-hosted browser additionally cannot connect to an HTTP Pod. The web field can be blank to use the current website origin. The native app requires an explicit address. Canonical origins remove trailing slashes and default ports.

The browser test rejects redirects, omits cookies and referrers, bounds the settings body at 100 KB and times out after twelve seconds. Native networking already rejects redirects and uses the existing fifteen-second timeout. Changing credentials or leaving the editor retires the test result. Native saves clear old Pod data immediately and prevent a refresh started under the previous connection from republishing it.

Demo connection setup uses `https://demo-pod.example` with an empty token. Testing and saving are simulated in memory; they do not load saved credentials, write connection preferences, contact a Pod or touch Keychain. The interface labels both results. Appearance remains a separate app preference.

## Apple Home

**Refresh bridge status** distinguishes loading, unavailable, disabled, starting, running and error states. A pairing code appears only with a running bridge. Running is not proof of pairing; add the accessory in Apple Home on the home network. Enabling the local bridge remains server configuration, as described in [platform setup](PLATFORM_SETUP.md).

Native **Connect Apple Home** explicitly creates the Home manager and requests platform access. The app distinguishes waiting, restricted/denied permission, loading homes, no homes and available scenes. After a denial, it can open its iPhone Settings page. Returning from Settings refreshes the existing authorization state. The distinction follows Apple's [Home manager authorization API](https://developer.apple.com/documentation/homekit/hmhomemanager/authorizationstatus).

Existing homes and scenes are displayed by name and updated when homes/scenes change. Before execution the selected IDs are resolved against the current authorized Home inventory. Only one scene executes at a time, with progress and success/failure feedback. Scenes can affect other accessories; the UI makes this clear. Demo mode never requests Home permission or runs scenes.

These are implementation and simulator checks. Signed-device permissions, real pairing, Home hub behavior and physical scene execution remain unverified. See [validation](VALIDATION.md).
