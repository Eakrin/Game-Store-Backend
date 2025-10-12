import express from "express";
import cors from "cors"; // ✅ เพิ่มบรรทัดนี้
import { router as index } from "./controller/index";


export const app = express();

// ✅ ใช้งาน CORS ให้ Angular เข้าถึงได้
app.use(cors({
  origin: "http://localhost:4200",
  methods: ["GET", "POST", "PUT", "DELETE"],
  credentials: true
}));

// ✅ แปลง body เป็น JSON
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ✅ ใช้งาน router หลัก (User / Admin / Wallet / Game)
app.use("/", index);

