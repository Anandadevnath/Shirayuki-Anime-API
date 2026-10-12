import 'dotenv/config';
import { cleanEnv, port, str } from 'envalid';

const env = cleanEnv(process.env, {
  PORT: port({ default: 4000 }),
  NODE_ENV: str({ default: 'development', choices: ['development', 'production', 'test'] }),
});

export default env;
