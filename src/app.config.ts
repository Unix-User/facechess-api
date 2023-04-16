import * as dotenv from 'dotenv';

dotenv.config();

let port, url, devPort, devUrl, prodPort, prodUrl;

if (process.env.NODE_ENV === 'development') {
  devPort = process.env.DEV_PORT || 3000;
  devUrl = process.env.DEV_URL || 'http://localhost';
  port = devPort;
  url = devUrl;
} else if (process.env.NODE_ENV === 'production') {
  prodPort = process.env.PROD_PORT || 3000;
  prodUrl = process.env.PROD_URL || 'http://localhost';
  port = prodPort;
  url = prodUrl;
} else {
  port = process.env.PORT || 3000;
  url = process.env.URL || 'http://localhost';
}

const config = { port, url };

export { config };

