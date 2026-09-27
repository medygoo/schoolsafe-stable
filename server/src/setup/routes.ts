import type { FastifyInstance } from "fastify";
import type { SetupService } from "./service.js";

export type SetupRouteDependencies = {
  service: Pick<SetupService, "getConfig">;
};

export function registerSetupRoutes(app: FastifyInstance, dependencies: SetupRouteDependencies): void {
  app.get("/config", async (_request, reply) => {
    return reply.status(200).send(dependencies.service.getConfig());
  });
}