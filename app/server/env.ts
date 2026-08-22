import { env } from 'cloudflare:workers';

export type AppEnv = Cloudflare.Env;

export function getEnv(): AppEnv {
  return env as AppEnv;
}
