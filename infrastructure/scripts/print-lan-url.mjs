// Prints the URLs a phone on the same Wi-Fi should use to reach your dev machine.
import { networkInterfaces } from 'node:os';

const ips = Object.values(networkInterfaces())
  .flat()
  .filter((i) => i && i.family === 'IPv4' && !i.internal)
  .map((i) => i.address);

if (ips.length === 0) {
  console.log('No LAN address found. Connect to Wi-Fi or use `pnpm --filter @servebell/customer-app start:tunnel`.');
} else {
  for (const ip of ips) {
    console.log(`API:     http://${ip}:4000/api/v1/health`);
    console.log(`Swagger: http://${ip}:4000/api/docs`);
    console.log(`QR web:  http://${ip}:3000`);
  }
  console.log('\nExpo apps derive the API host automatically from the Expo dev server address.');
}
