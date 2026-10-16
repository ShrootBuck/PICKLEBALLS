import "server-only";
import { createBuildTVReader } from "./build-tv-reader";

const {
  COOLIFY_API_URL,
  COOLIFY_READ_TOKEN,
  COOLIFY_WEB_APP_UUID,
  COOLIFY_WORKER_APP_UUID,
} = process.env;

export const readBuildTV = createBuildTVReader({
  config:
    COOLIFY_API_URL &&
    COOLIFY_READ_TOKEN &&
    COOLIFY_WEB_APP_UUID &&
    COOLIFY_WORKER_APP_UUID
      ? {
          apiUrl: COOLIFY_API_URL,
          token: COOLIFY_READ_TOKEN,
          webUuid: COOLIFY_WEB_APP_UUID,
          workerUuid: COOLIFY_WORKER_APP_UUID,
        }
      : null,
});
