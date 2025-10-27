import http from "http";
import { app } from "./app";
import express from "express";

app.use("/uploads", express.static("uploads"));

const port = process.env.PORT || 3200;
const server = http.createServer(app);

server.listen(port, () => console.log(`✅ Server running on port ${port}`));