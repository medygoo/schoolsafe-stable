import type {BusinessPool} from "../db/pool.js";
import type {RequestContext} from "../db/context.js";
import {SchoolSafeError} from "../http/errors.js";
export function createMachineContextResolver(pool: BusinessPool) {
  return async (instanceId: string, deviceId: string, requestId: string): Promise<RequestContext> => {
    const result = await pool.query<{context: RequestContext}>("select api.machine_device_context($1,$2,$3) context", [instanceId,deviceId,requestId]);
    const context = result.rows[0]?.context;
    if (!context) throw new SchoolSafeError(403,"ACCESS_DENIED","Device binding unavailable",false);
    return context;
  };
}
