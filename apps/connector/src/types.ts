import type { Logger } from "pino";

export type AppEnv = {
  Variables: {
    requestId: string;
    logger: Logger;
  };
};
