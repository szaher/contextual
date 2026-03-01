import express from "express";
import { authMiddleware } from "./auth";
import { prisma } from "./database";

const app = express();

app.use(express.json());
app.use(authMiddleware);

app.get("/tasks", async (req, res) => {
  const tasks = await prisma.task.findMany({
    where: { userId: req.user.id },
  });
  res.json(tasks);
});

app.post("/tasks", async (req, res) => {
  const task = await prisma.task.create({
    data: {
      title: req.body.title,
      userId: req.user.id,
    },
  });
  res.status(201).json(task);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
