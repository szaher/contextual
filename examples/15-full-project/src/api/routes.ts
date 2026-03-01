import { Express } from "express";
import { asyncHandler } from "../middleware/async";
import { TaskHandler } from "./handlers/tasks";
import { ProjectHandler } from "./handlers/projects";
import { AuthHandler } from "./handlers/auth";

/**
 * Registers all API routes.
 * Route order matters -- see gotchas in .ctx.
 */
export function registerApiRoutes(app: Express): void {
  const tasks = new TaskHandler();
  const projects = new ProjectHandler();
  const auth = new AuthHandler();

  // Auth (public)
  app.post("/api/auth/login", asyncHandler(auth.login));
  app.post("/api/auth/register", asyncHandler(auth.register));
  app.post("/api/auth/refresh", asyncHandler(auth.refreshToken));

  // Tasks
  app.get("/api/v1/tasks/export", asyncHandler(tasks.export)); // Before :id!
  app.get("/api/v1/tasks", asyncHandler(tasks.list));
  app.get("/api/v1/tasks/:id", asyncHandler(tasks.getById));
  app.post("/api/v1/tasks", asyncHandler(tasks.create));
  app.put("/api/v1/tasks/:id", asyncHandler(tasks.update));
  app.delete("/api/v1/tasks/:id", asyncHandler(tasks.remove));

  // Projects
  app.get("/api/v1/projects", asyncHandler(projects.list));
  app.get("/api/v1/projects/:id", asyncHandler(projects.getById));
  app.post("/api/v1/projects", asyncHandler(projects.create));
  app.put("/api/v1/projects/:id", asyncHandler(projects.update));
  app.delete("/api/v1/projects/:id", asyncHandler(projects.remove));
}
