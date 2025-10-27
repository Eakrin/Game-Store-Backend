import express from "express";
import {
  addDoc,
  collection,
  doc,
  getDocs,
  increment,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  where
} from "firebase/firestore";
import { db } from "../firebaseConfig";
import jwt from "jsonwebtoken";
import { getDoc } from "firebase/firestore";
import multer from "multer";
import path from "path";
import fs from "fs";

import { v2 as cloudinary } from "cloudinary";
import { CloudinaryStorage } from "multer-storage-cloudinary";
import dotenv from "dotenv";

export const router = express.Router();





router.get('/', (req, res) => {
  res.send('Hello Game Store API');
});



// 1.1 สมัครสมาชิก (Register)
router.post("/register", async (req, res) => {
  try {
    const { name, email, password } = req.body;

    // ✅ 1. ตรวจสอบว่ากรอกครบ
    if (!name || !email || !password)
      return res.status(400).send({ message: "กรอกข้อมูลให้ครบ" });

    // ✅ 2. ตรวจสอบรูปแบบอีเมล
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email))
      return res.status(400).send({ message: "อีเมลไม่ถูกต้อง" });

    // ✅ 3. ตรวจสอบความยาวรหัสผ่าน (อย่างน้อย 4 ตัวอักษร)
    if (password.length < 4)
      return res.status(400).send({ message: "รหัสผ่านต้องมีอย่างน้อย 4 ตัวอักษร" });

    // ✅ 4. ตรวจสอบอีเมลซ้ำ
    const q = query(collection(db, "users"), where("email", "==", email));
    const check = await getDocs(q);
    if (!check.empty)
      return res.status(400).send({ message: "อีเมลนี้ถูกใช้แล้ว" });

    // ✅ 5. เพิ่มข้อมูลลง Firestore
    const ref = await addDoc(collection(db, "users"), {
      name,
      email,
      password, // ⚠️ ของจริงควร hash
      role: "user",
      createdAt: new Date(),
    });

    res.status(201).send({ message: "สมัครสมาชิกสำเร็จ", id: ref.id });
  } catch (err: any) {
    console.error(err);
    res.status(500).send({ message: "สมัครสมาชิกไม่สำเร็จ", error: err.message });
  }
});



// 1.2 แก้ไขโปรไฟล์ผู้ใช้ (อัปเดตรูป/ข้อมูล)

router.put("/profile/:id", async (req, res) => {
  try {
    const { name, email, profileImage } = req.body;
    const userRef = doc(db, "users", req.params.id);

    // 🔹 สร้าง object แล้วลบ key ที่ undefined ออก
    const updateData: any = { name, email, profileImage };
    Object.keys(updateData).forEach(
      (key) => updateData[key] === undefined && delete updateData[key]
    );

    await updateDoc(userRef, updateData);
    res.send({ message: "แก้ไขโปรไฟล์สำเร็จ" });
  } catch (err: any) {
    res.status(500).send({ message: "อัปเดตไม่สำเร็จ", error: err.message });
  }
});

// ✅ 1.4 ดึงข้อมูลโปรไฟล์ผู้ใช้ตาม ID
router.get("/profile/:id", async (req, res) => {
  try {
    const userId = req.params.id;

    if (!userId) {
      return res.status(400).send({ message: "กรุณาระบุ ID ผู้ใช้" });
    }

    const userRef = doc(db, "users", userId);
    const snapshot = await getDocs(query(collection(db, "users"), where("__name__", "==", userId)));

    if (snapshot.empty) {
      return res.status(404).send({ message: "ไม่พบผู้ใช้" });
    }
    const user = snapshot.docs[0]!.data();

    res.send({
      message: "ดึงข้อมูลสำเร็จ",
      user: {
        id: userId,
        name: user.name,
        email: user.email,
        profileImage: user.profileImage || "",
        role: user.role || "user",
        createdAt: user.createdAt || null,
      },
    });
  } catch (err: any) {
    console.error(err);
    res.status(500).send({
      message: "ไม่สามารถดึงข้อมูลผู้ใช้ได้",
      error: err.message,
    });
  }
});


// 1.3 Login แยกสิทธิ์ (User / Admin)
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password)
      return res.status(400).send({ message: "กรอกอีเมลและรหัสผ่านให้ครบ" });

    const q = query(
      collection(db, "users"),
      where("email", "==", email),
      where("password", "==", password)
    );

    const snap = await getDocs(q);

    if (snap.empty)
      return res.status(401).send({ message: "อีเมลหรือรหัสผ่านไม่ถูกต้อง" });

    const user = snap.docs[0]!.data();
    const userId = snap.docs[0]!.id; // ✅ ดึง id ของเอกสารใน Firestore

    res.send({
      message: "เข้าสู่ระบบสำเร็จ",
      user: {
        id: userId, // ✅ เพิ่ม id
        name: user.name,
        email: user.email,
        role: user.role
      }
    });
  } catch (err: any) {
    console.error(err);
    res.status(500).send({ message: "เข้าสู่ระบบล้มเหลว", error: err.message });
  }
});



// ✅ 1.5 แก้ไขข้อมูลโปรไฟล์ผู้ใช้
router.put("/profile/:id", async (req, res) => {
  try {
    const { name, email, profileImage } = req.body;
    const userId = req.params.id;

    if (!userId) {
      return res.status(400).send({ message: "ไม่พบรหัสผู้ใช้ (user id)" });
    }

    const userRef = doc(db, "users", userId);

    // ✅ ตรวจสอบข้อมูลที่จะอัปเดต
    const updateData: any = {};
    if (name) updateData.name = name;
    if (email) updateData.email = email;
    if (profileImage) updateData.profileImage = profileImage;

    await updateDoc(userRef, updateData);

    res.send({
      message: "อัปเดตข้อมูลโปรไฟล์สำเร็จ ✅",
      user: { id: userId, ...updateData },
    });
  } catch (err: any) {
    console.error("❌ Error:", err);
    res.status(500).send({
      message: "อัปเดตข้อมูลไม่สำเร็จ ❌",
      error: err.message,
    });
  }
});

// 2.ระบบจัดการข้อมูลเกมและค้นหา (Game Data & Search) (Admin/User) 7 คะแนน
// ✅ 2.1 เพิ่มเกม (Create)
router.post("/admin_add/games", async (req, res) => {
  try {
    const { name, price, category, description, imageUrl } = req.body;

    if (!name || !price || !category)
      return res.status(400).send({ message: "กรอกข้อมูลให้ครบ" });

    const newGame = {
      name,
      price,
      category,
      description: description || "",
      imageUrl: imageUrl || "",
      releaseDate: new Date(),
      createdAt: new Date(),
    };

    const ref = await addDoc(collection(db, "games"), newGame);
    res.status(201).send({ message: "เพิ่มเกมสำเร็จ ✅", id: ref.id });
  } catch (err: any) {
    console.error(err);
    res.status(500).send({ message: "เพิ่มเกมไม่สำเร็จ ❌", error: err.message });
  }
});



// ✅ 2.2 ดูเกมทั้งหมด (Read All)
router.get("/admin_read/games", async (req, res) => {
  try {
    const snapshot = await getDocs(collection(db, "games"));
    const games = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

    res.send({
      message: "ดึงข้อมูลเกมทั้งหมดสำเร็จ ✅",
      count: games.length,
      games,
    });
  } catch (err: any) {
    res.status(500).send({ message: "ดึงข้อมูลไม่สำเร็จ ❌", error: err.message });
  }
});



// ✅ 2.3 ดูรายละเอียดเกมตาม ID (Read One)
router.get("/admin_search/games/:id", async (req, res) => {
  try {
    const gameRef = doc(db, "games", req.params.id);
    const gameSnap = await getDoc(gameRef);

    if (!gameSnap.exists())
      return res.status(404).send({ message: "ไม่พบข้อมูลเกม ❌" });

    res.send({
      message: "ดึงข้อมูลเกมสำเร็จ ✅",
      game: { id: gameSnap.id, ...gameSnap.data() },
    });
  } catch (err: any) {
    res.status(500).send({ message: "ดึงข้อมูลเกมไม่สำเร็จ ❌", error: err.message });
  }
});



// ✅ 2.4 แก้ไขข้อมูลเกม (Update)
router.put("/admin_update/games/:id", async (req, res) => {
  try {
    const { name, price, category, description, imageUrl } = req.body;
    const gameRef = doc(db, "games", req.params.id);

    const updateData: any = {
      updatedAt: new Date(),
    };
    if (name) updateData.name = name;
    if (price) updateData.price = price;
    if (category) updateData.category = category;
    if (description) updateData.description = description;
    if (imageUrl) updateData.imageUrl = imageUrl;

    await updateDoc(gameRef, updateData);
    res.send({ message: "อัปเดตข้อมูลเกมสำเร็จ ✅" });
  } catch (err: any) {
    res.status(500).send({ message: "อัปเดตข้อมูลไม่สำเร็จ ❌", error: err.message });
  }
});



// ✅ 2.5 ลบเกม (Delete)
import { deleteDoc } from "firebase/firestore"; // ✅ ต้อง import ด้วยนะครับ

router.delete("/admin_delete/games/:id", async (req, res) => {
  try {
    const gameRef = doc(db, "games", req.params.id);

    // 🔹 ลบข้อมูลเกมออกจาก Firestore จริง ๆ
    await deleteDoc(gameRef);

    res.send({ message: "ลบเกมสำเร็จ ✅" });
  } catch (err: any) {
    console.error("❌ Error deleting game:", err);
    res.status(500).send({ message: "ลบเกมไม่สำเร็จ ❌", error: err.message });
  }
});


dotenv.config();



dotenv.config();

// ✅ ตั้งค่า Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUD_NAME!,
  api_key: process.env.CLOUD_API_KEY!,
  api_secret: process.env.CLOUD_API_SECRET!,
});

const mem = multer({ storage: multer.memoryStorage() });

// ✅ ตั้งค่า Storage ให้ multer ใช้ cloudinary
const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: "game-store", // ✅ ชื่อโฟลเดอร์ใน Cloudinary
    allowed_formats: ["jpg", "png", "jpeg"],
    // อื่นๆ (ถ้ามี)
  } as any, // เพิ่ม type assertion ถ้า TypeScript ยัง error
});

const upload = multer({ storage });

// ✅ เส้นทางอัปโหลดรูปภาพเกม
router.post("/admin_upload/game-image", upload.single("image"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).send({ message: "กรุณาอัปโหลดไฟล์รูปภาพ" });
    }

    const { name, price, category, description } = req.body;

    // 🔹 ได้ URL จาก Cloudinary
    const imageUrl = (req.file as any).path; // cloudinary จะส่ง URL กลับใน req.file.path

    // 🔹 บันทึกข้อมูลลง Firestore
    const gameData = {
      name,
      price: Number(price),
      category,
      description: description || "",
      imageUrl, // ✅ ใช้ URL จาก Cloudinary
      createdAt: new Date(),
    };

    const ref = await addDoc(collection(db, "games"), gameData);

    res.send({
      message: "อัปโหลดรูปเกมพร้อมเพิ่มข้อมูลสำเร็จ ✅",
      id: ref.id,
      imageUrl,
    });
  } catch (err: any) {
    console.error("❌ Upload Error:", err);
    res.status(500).send({ message: "อัปโหลดรูปภาพไม่สำเร็จ ❌", error: err.message });
  }
});


// ✅ ดึงประเภทเกมทั้งหมด (Categories)
router.get("/categories", async (req, res) => {
  try {
    const snapshot = await getDocs(collection(db, "categories"));
    const categories = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

    res.send({
      message: "ดึงข้อมูลประเภทเกมสำเร็จ ✅",
      count: categories.length,
      categories,
    });
  } catch (err: any) {
    res.status(500).send({
      message: "ไม่สามารถดึงข้อมูลประเภทเกมได้ ❌",
      error: err.message,
    });
  }
});

// ✅ เพิ่มประเภทเกมใหม่
// ใช้สำหรับ: Admin เพิ่มประเภทเกมใหม่เข้า Firestore
router.post("/admin_add/category", async (req, res) => {
  try {
    const { name, description } = req.body;
    if (!name) return res.status(400).send({ message: "กรุณาระบุชื่อประเภทเกม" });

    const ref = await addDoc(collection(db, "categories"), {
      name,
      description: description || "",
      createdAt: new Date(),
    });

    res.status(201).send({ message: "เพิ่มประเภทเกมสำเร็จ ✅", id: ref.id });
  } catch (err: any) {
    res.status(500).send({ message: "เพิ่มประเภทเกมไม่สำเร็จ ❌", error: err.message });
  }
});


// ✅ 2.6 ค้นหาเกม (ชื่อ / ประเภท) (User)
router.get("/search/games", async (req, res) => {
  try {
    const { keyword } = req.query;

    // 🔹 ตรวจสอบว่าผู้ใช้ใส่คำค้นมาหรือไม่
    if (!keyword || keyword.toString().trim() === "") {
      return res
        .status(400)
        .send({ message: "กรุณาระบุคำค้นหา (keyword)" });
    }

    // 🔹 ดึงข้อมูลเกมทั้งหมดจาก Firestore
    const snapshot = await getDocs(collection(db, "games"));
    const games = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

    // 🔹 แปลง keyword เป็น lowercase เพื่อค้นหาแบบไม่สนตัวพิมพ์ใหญ่เล็ก
    const lowerKeyword = keyword.toString().toLowerCase();

    // 🔹 กรองผลลัพธ์เกมที่มีชื่อ หรือประเภท ตรงกับ keyword
    const results = games.filter(
      (g: any) =>
        g.name.toLowerCase().includes(lowerKeyword) ||
        g.category.toLowerCase().includes(lowerKeyword)
    );

    res.send({
      message: `ค้นหาข้อมูลสำเร็จ ✅ พบ ${results.length} รายการ`,
      count: results.length,
      results,
    });
  } catch (err: any) {
    console.error("❌ Error searching games:", err);
    res.status(500).send({
      message: "ค้นหาข้อมูลไม่สำเร็จ ❌",
      error: err.message,
    });
  }
});




// 3.ระบบกระเป๋าเงินและธุรกรรม (Wallet & Transaction) (User/Admin) 8 คะแนน
// User แสดง Wallet Balance และยอดเงินคงเหลือ
router.get("/wallet/:userId", async (req, res) => {
  try {
    const { userId } = req.params;

    if (!userId) {
      return res.status(400).send({ message: "กรุณาระบุรหัสผู้ใช้ (userId)" });
    }

    // 🔹 ดึงข้อมูลจาก collection 'wallets'
    const walletRef = doc(db, "wallets", userId);
    const walletSnap = await getDoc(walletRef);

    if (!walletSnap.exists()) {
      return res.status(404).send({
        userId,
        balance: 0,
      });
    }

    const walletData = walletSnap.data();

    res.send({
      userId,
      balance: walletData.balance ?? 0,
      lastUpdated: walletData.lastUpdated ?? null,
      message: "ดึงข้อมูลยอดเงินสำเร็จ ✅",
    });
  } catch (err: any) {
    console.error("❌ Error fetching wallet:", err);
    res.status(500).send({
      message: "เกิดข้อผิดพลาดในการดึงข้อมูลกระเป๋าเงิน ❌",
      error: err.message,
    });
  }
});



// ✅ 3.2 เติมเงินเข้ากระเป๋า (Top-up)
// /wallet_topup (เวอร์ชันกัน race + กันยิงซ้ำ)
router.post("/wallet_topup", async (req, res) => {
  try {
    const { userId, amount, requestId } = req.body;
    const amt = Number(amount);

    if (!userId || !Number.isFinite(amt) || amt <= 0 || !requestId) {
      return res.status(400).send({ message: "กรุณาระบุ userId, amount (>0) และ requestId" });
    }

    const walletRef = doc(db, "wallets", userId);
    const reqRef    = doc(db, "topup_requests", requestId);

    const result = await runTransaction(db, async (tx) => {
      // ถ้า requestId นี้เคยถูกประมวลผลแล้ว → อ่านค่าเดิมคืน
      const reqSnap = await tx.get(reqRef);
      if (reqSnap.exists()) {
        return reqSnap.data(); // {balanceAfter, processedAt, ...}
      }

      // อ่าน wallet
      const wSnap = await tx.get(walletRef);
      const current = Number(wSnap.exists() ? (wSnap.data().balance ?? 0) : 0);
      const balanceAfter = current + amt;

      if (!wSnap.exists()) {
        tx.set(walletRef, { balance: amt, lastUpdated: serverTimestamp() });
      } else {
        tx.update(walletRef, { balance: increment(amt), lastUpdated: serverTimestamp() });
      }

      // บันทึกธุรกรรม (ปลอดภัยใน txn เดียวกันถ้าต้องการ)
      const txRef = doc(collection(db, "transactions"));
      tx.set(txRef, {
        userId,
        type: "topup",
        amount: amt,
        detail: "เติมเงินผ่านระบบ",
        createdAt: serverTimestamp(),
        requestId,
      });

      // ทำเครื่องหมายว่า request นี้ “ประมวลผลแล้ว”
      tx.set(reqRef, {
        userId,
        amount: amt,
        balanceAfter,
        processedAt: serverTimestamp(),
      });

      return { balanceAfter };
    });

    return res.send({ message: "เติมเงินสำเร็จ ✅", balance: result.balanceAfter });
  } catch (err: any) {
    console.error("❌ topup error", err);
    return res.status(500).send({ message: "เกิดข้อผิดพลาดในการเติมเงิน ❌", error: err.message });
  }
});




// ✅ 3.5 ถอนเงินออกจากกระเป๋า (Withdraw)
router.post("/wallet_withdraw", async (req, res) => {
  try {
    const { userId, amount } = req.body;

    // 🔹 ตรวจสอบข้อมูลที่รับมา
    if (!userId || amount === undefined)
      return res.status(400).send({ message: "กรุณาระบุ userId และจำนวนเงินที่จะถอน" });

    if (amount <= 0)
      return res.status(400).send({ message: "จำนวนเงินต้องมากกว่า 0" });

    // 🔹 อ้างอิงกระเป๋าใน Firestore
    const walletRef = doc(db, "wallets", userId);
    const walletSnap = await getDoc(walletRef);

    if (!walletSnap.exists())
      return res.status(404).send({ message: "ไม่พบบัญชีกระเป๋าเงิน" });

    const currentBalance = walletSnap.data().balance ?? 0;

    // 🔹 ตรวจสอบยอดเงินคงเหลือ
    if (currentBalance < amount)
      return res.status(400).send({ message: "ยอดเงินไม่พอสำหรับถอน ❌" });

    const newBalance = currentBalance - amount;

    // 🔹 อัปเดตยอดเงินใหม่ใน Firestore
    await updateDoc(walletRef, {
      balance: newBalance,
      lastUpdated: new Date(),
    });

    // 🔹 บันทึกธุรกรรม (transactions)
    await addDoc(collection(db, "transactions"), {
      userId,
      type: "withdraw",
      amount,
      detail: "ถอนเงินออกจากกระเป๋า",
      createdAt: new Date(),
    });

    res.send({
      message: "ถอนเงินสำเร็จ ✅",
      withdrawn: amount,
      balance: newBalance,
    });
  } catch (err: any) {
    console.error("❌ Error withdraw:", err);
    res.status(500).send({
      message: "เกิดข้อผิดพลาดในการถอนเงิน ❌",
      error: err.message,
    });
  }
});




// User ดูประวัติการทำรายการ (Transaction History: เติมเงิน/ซื้อเกม)
router.get("/wallet/transactions/:userId", async (req, res) => {
  try {
    const { userId } = req.params;

    if (!userId) {
      return res.status(400).send({ message: "กรุณาระบุ userId" });
    }

    // ✅ Query ธุรกรรมทั้งหมดของ user โดยไม่เรียงเวลา
    const q = query(
      collection(db, "transactions"),
      where("userId", "==", userId)
    );

    const snapshot = await getDocs(q);

    if (snapshot.empty) {
      return res.status(404).send({
        message: "ยังไม่มีประวัติธุรกรรม",
        transactions: [],
      });
    }

    const transactions = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

    res.send({
      message: "ดึงข้อมูลธุรกรรมสำเร็จ ✅",
      count: transactions.length,
      transactions,
    });
  } catch (err: any) {
    console.error("❌ Error fetching transactions:", err);
    res.status(500).send({
      message: "เกิดข้อผิดพลาดในการดึงข้อมูลธุรกรรม ❌",
      error: err.message,
    });
  }
});



// ✅ 3.4 Admin ดูประวัติธุรกรรมของผู้ใช้ทุกคน
router.get("/admin/transactions", async (req, res) => {
  try {
    // 🔹 ดึงข้อมูลธุรกรรมทั้งหมด เรียงจากล่าสุดก่อน
    const q = query(collection(db, "transactions"), orderBy("createdAt", "desc"));
    const snapshot = await getDocs(q);

    if (snapshot.empty) {
      return res.status(404).send({
        message: "ยังไม่มีธุรกรรมในระบบ ❌",
        transactions: [],
      });
    }

    // ✅ สร้าง interface เพื่อให้ TypeScript เข้าใจข้อมูลธุรกรรม
    interface Transaction {
      id: string;
      userId: string;
      type: string;
      amount: number;
      detail?: string;
      createdAt?: any;
    }

    // 🔹 แปลงข้อมูลธุรกรรมทั้งหมด
    const transactions: Transaction[] = snapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        userId: data.userId,
        type: data.type,
        amount: data.amount,
        detail: data.detail,
        createdAt: data.createdAt?.toDate
          ? data.createdAt.toDate().toISOString()
          : null,
      };
    });

    // 🔹 ดึงข้อมูลผู้ใช้ทั้งหมด
    const usersSnap = await getDocs(collection(db, "users"));
    const userMap: Record<string, { name?: string; email?: string }> = {};

    usersSnap.docs.forEach((u) => {
      userMap[u.id] = u.data() as { name?: string; email?: string };
    });

    // 🔹 รวมชื่อผู้ใช้กับธุรกรรม (แก้จุด error)
    const mergedData = transactions.map((t) => ({
      ...t,
      userName: userMap[t.userId]?.name || "Unknown User",
      userEmail: userMap[t.userId]?.email || "-",
    }));

    res.send({
      message: "ดึงข้อมูลธุรกรรมทั้งหมดสำเร็จ ✅",
      count: mergedData.length,
      transactions: mergedData,
    });
  } catch (err: any) {
    console.error("❌ Error fetching all transactions:", err);
    res.status(500).send({
      message: "เกิดข้อผิดพลาดในการดึงข้อมูลธุรกรรม ❌",
      error: err.message,
    });
  }
});



// ✅ 3.3 ซื้อเกม (หักเงินออกจาก Wallet + บันทึกธุรกรรม + ป้องกันซื้อซ้ำ)
router.post("/wallet_purchase", async (req, res) => {
  try {
    const { userId, gameName, amount } = req.body;

    // 🔹 ตรวจสอบข้อมูลที่รับมา
    if (!userId || !gameName || !amount)
      return res.status(400).send({ message: "กรุณาระบุ userId, gameName และ amount" });

    // 🔹 ตรวจสอบว่าผู้ใช้เคยซื้อเกมนี้ไปแล้วหรือยัง
    const checkPurchase = query(
      collection(db, "transactions"),
      where("userId", "==", userId),
      where("type", "==", "purchase"),
      where("detail", "==", `ซื้อเกม ${gameName}`)
    );
    const purchaseSnap = await getDocs(checkPurchase);

    if (!purchaseSnap.empty) {
      return res.status(400).send({
        message: `คุณได้ซื้อเกม "${gameName}" แล้วก่อนหน้านี้ ❌`,
      });
    }

    // 🔹 อ้างอิงกระเป๋าเงิน
    const walletRef = doc(db, "wallets", userId);
    const walletSnap = await getDoc(walletRef);

    if (!walletSnap.exists())
      return res.status(404).send({ message: "ไม่พบบัญชีกระเป๋าเงิน" });

    const balance = walletSnap.data().balance ?? 0;

    // 🔹 ตรวจสอบยอดเงินคงเหลือ
    if (balance < amount)
      return res.status(400).send({ message: "ยอดเงินไม่พอสำหรับซื้อเกม ❌" });

    const newBalance = balance - amount;

    // 🔹 อัปเดตยอดเงินในกระเป๋า
    await updateDoc(walletRef, {
      balance: newBalance,
      lastUpdated: new Date(),
    });

    // 🔹 เพิ่มธุรกรรมใหม่
    await addDoc(collection(db, "transactions"), {
      userId,
      type: "purchase",
      amount,
      detail: `ซื้อเกม ${gameName}`,
      createdAt: new Date(),
    });

    res.send({
      message: `ซื้อเกม ${gameName} สำเร็จ ✅`,
      balance: newBalance,
      spent: amount,
    });
  } catch (err: any) {
    console.error("❌ Error purchase:", err);
    res.status(500).send({
      message: "เกิดข้อผิดพลาดในการซื้อเกม ❌",
      error: err.message,
    });
  }
});

// ✅ อัปโหลดรูปภาพ “อย่างเดียว” เพื่อเอา URL ไปอัปเดตเกม (ตอนแก้ไข)
// index.ts (router)
router.post("/admin_upload/image-only", mem.single("image"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).send({ message: "กรุณาอัปโหลดไฟล์รูปภาพ" });
    }

    const stream = cloudinary.uploader.upload_stream(
      { folder: "game-store", resource_type: "image" },
      (err, result) => {
        if (err) {
          console.error("Cloudinary error:", err);
          return res.status(500).send({ message: "อัปโหลดรูปภาพไม่สำเร็จ ❌", error: err.message });
        }
        return res.send({ message: "อัปโหลดรูปสำเร็จ ✅", imageUrl: result?.secure_url });
      }
    );

    stream.end(req.file.buffer); // ป้อนไฟล์จากเครื่องเข้า stream
  } catch (e: any) {
    console.error("❌ Upload Error:", e);
    res.status(500).send({ message: "อัปโหลดรูปภาพไม่สำเร็จ ❌", error: e?.message });
  }
});

/* -------------------------------------------------------------------------- */
/* ✅ เพิ่มสินค้าเข้าตะกร้า (Add to Cart)
   รับข้อมูลจากฝั่งผู้ใช้ เช่น userId, gameId, name, price
   แล้วบันทึกลง Firestore ใน collection "cart"
-----------------------------------------------------------------------------*/
router.post("/user_cart/add", async (req, res) => {
  try {
    // ✅ ดึงข้อมูลจาก body ที่ผู้ใช้ส่งมา
    const { userId, gameId, name, price } = req.body;

    // ✅ ตรวจสอบว่ากรอกข้อมูลครบหรือไม่
    if (!userId || !gameId || !name || price === undefined)
      return res.status(400).send({ message: "กรุณากรอกข้อมูลให้ครบ" });

    // ✅ เพิ่มข้อมูลสินค้าใหม่ลงใน collection "cart"
    const ref = await addDoc(collection(db, "cart"), {
      userId,       // รหัสผู้ใช้
      gameId,       // รหัสสินค้า
      name,         // ชื่อสินค้า
      price,        // ราคาสินค้า
      createdAt: new Date(), // วันเวลาที่เพิ่มลงตะกร้า
    });

    // ✅ ส่งข้อความตอบกลับเมื่อเพิ่มสินค้าสำเร็จ
    res.send({ message: "เพิ่มสินค้าเข้าตะกร้าสำเร็จ ✅", id: ref.id });
  } catch (err: any) {
    // ❌ หากเกิดข้อผิดพลาด จะส่ง error กลับไปให้ client
    console.error("❌ Error adding to cart:", err);
    res.status(500).send({ message: "เพิ่มสินค้าไม่สำเร็จ ❌", error: err.message });
  }
});

/* -------------------------------------------------------------------------- */
/* ✅ แสดงสินค้าทั้งหมดในตะกร้า (View Cart)
   ดึงข้อมูลสินค้าจาก Firestore ตาม userId
   และคำนวณราคารวมของสินค้าทั้งหมดในตะกร้า
-----------------------------------------------------------------------------*/
router.get("/user_cart/:userId", async (req, res) => {
  try {
    // ✅ ดึง userId จากพารามิเตอร์ใน URL
    const { userId } = req.params;

    // ✅ สร้าง query เพื่อค้นหาสินค้าทั้งหมดที่ userId ตรงกัน
    const q = query(collection(db, "cart"), where("userId", "==", userId));

    // ✅ ดึงเอกสารทั้งหมดจาก Firestore
    const snap = await getDocs(q);

    // ✅ ถ้าไม่มีสินค้าในตะกร้าเลย
    if (snap.empty)
      return res.send({
        message: "ยังไม่มีสินค้าในตะกร้า",
        count: 0,         // จำนวนสินค้า = 0
        totalPrice: 0,    // ราคารวม = 0
        cartItems: [],    // ไม่มีข้อมูลสินค้า
      });

    // ✅ แปลงข้อมูลแต่ละเอกสารเป็น object พร้อม id
    const cartItems = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

    // ✅ คำนวณราคารวมทั้งหมดของสินค้าในตะกร้า
    const totalPrice = cartItems.reduce((sum: number, i: any) => sum + (i.price ?? 0), 0);

    // ✅ ส่งข้อมูลกลับไปให้ฝั่ง client
    res.send({
      message: "ดึงข้อมูลตะกร้าสำเร็จ ✅",
      count: cartItems.length, // จำนวนสินค้าทั้งหมด
      totalPrice,              // ราคารวมทั้งหมด
      cartItems,               // รายการสินค้าในตะกร้า
    });
  } catch (err: any) {
    // ❌ หากเกิดข้อผิดพลาดในการดึงข้อมูล
    console.error("❌ Error reading cart:", err);
    res.status(500).send({ message: "ไม่สามารถดึงข้อมูลตะกร้าได้ ❌", error: err.message });
  }
});

/* -------------------------------------------------------------------------- */
/* ✅ ลบสินค้าออกจากตะกร้า (Remove from Cart)
   ลบเอกสารสินค้าออกจาก Firestore ตาม id ของสินค้า
-----------------------------------------------------------------------------*/
router.delete("/user_cart/remove/:id", async (req, res) => {
  try {
    // ✅ ดึง id ของสินค้า (เป็น document id ใน Firestore)
    const { id } = req.params;

    // ✅ ตรวจสอบว่ามีการส่ง id มาหรือไม่
    if (!id) return res.status(400).send({ message: "กรุณาระบุรหัสสินค้า" });

    // ✅ ลบเอกสารสินค้าตาม id ที่กำหนด
    await deleteDoc(doc(db, "cart", id));

    // ✅ ส่งข้อความตอบกลับเมื่อการลบสำเร็จ
    res.send({ message: "ลบสินค้าออกจากตะกร้าสำเร็จ ✅" });
  } catch (err: any) {
    // ❌ หากเกิดข้อผิดพลาดในการลบสินค้า
    console.error("❌ Error removing from cart:", err);
    res.status(500).send({ message: "ลบสินค้าไม่สำเร็จ ❌", error: err.message });
  }
});




// ✅ 4.2 การแสดงราคาหลังใช้โค้ดส่วนลดโปรโมชั่นในตะกร้า

router.post("/user_cart/apply_promo", async (req, res) => {
  try {
    const { userId, promoCode } = req.body;

    // ✅ ตรวจสอบว่ากรอกข้อมูลครบหรือไม่
    if (!userId || !promoCode) {
      return res
        .status(400)
        .send({ message: "กรุณากรอก userId และ promoCode" });
    }
    /* ---------------------------------------------------------------------- */
    /* ✅ ดึงข้อมูลโค้ดโปรโมชั่นจาก Firestore */
    /* ---------------------------------------------------------------------- */
    const promoQuery = query(
      collection(db, "promotions"),
      where("code", "==", promoCode)
    );
    const promoSnap = await getDocs(promoQuery);

    // ❌ ถ้าไม่พบโค้ดส่วนลด
    if (promoSnap.empty) {
      return res.status(404).send({ message: "ไม่พบโค้ดส่วนลดนี้ ❌" });
    }

    // ✅ ดึงเอกสารโปรโมชั่นตัวแรก (เช็กแล้วว่ามี)
    const promoDoc = promoSnap.docs[0];
    if (!promoDoc) {
      return res.status(404).send({ message: "ไม่พบข้อมูลโปรโมชั่น ❌" });
    }

    // ✅ แปลงข้อมูลโปรโมชั่นออกมา
    const promo = promoDoc.data() as {
      code: string;
      discountPercent: number;
      isActive: boolean;
      expireAt?: string;
    };

    // ❌ ถ้าโค้ดหมดอายุหรือปิดใช้งาน
    if (!promo.isActive) {
      return res.status(400).send({ message: "โค้ดนี้หมดอายุแล้ว ❌" });
    }

    /* ---------------------------------------------------------------------- */
    /* ✅ ดึงสินค้าทั้งหมดในตะกร้าของ user */
    /* ---------------------------------------------------------------------- */
    const cartQuery = query(collection(db, "cart"), where("userId", "==", userId));
    const cartSnap = await getDocs(cartQuery);

    if (cartSnap.empty) {
      return res.status(404).send({ message: "ไม่มีสินค้าในตะกร้า ❌" });
    }

    // ✅ รวมรายการสินค้าในตะกร้า
    const cartItems = cartSnap.docs.map((d) => d.data() as { price?: number; name?: string });
    const totalPrice = cartItems.reduce((sum, i) => sum + (i.price ?? 0), 0);

    /* ---------------------------------------------------------------------- */
    /* ✅ คำนวณราคาหลังหักส่วนลด */
    /* ---------------------------------------------------------------------- */
    const discountPercent = promo.discountPercent ?? 0;
    const discount = (totalPrice * discountPercent) / 100;
    const finalPrice = totalPrice - discount;

    /* ---------------------------------------------------------------------- */
    /* ✅ ส่งผลลัพธ์กลับ */
    /* ---------------------------------------------------------------------- */
    res.send({
      message: `ใช้โค้ดส่วนลด ${promoCode} สำเร็จ ✅`,
      discountPercent,
      totalPrice,
      discount,
      finalPrice,
    });
  } catch (err: any) {
    console.error("❌ Error applying promo:", err);
    res.status(500).send({
      message: "เกิดข้อผิดพลาดในการใช้โค้ดส่วนลด ❌",
      error: err.message,
    });
  }
});


// ✅ เพิ่มโค้ดโปรโมชั่นใหม่
router.post("/promotions/add", async (req, res) => {
  try {
    const { code, discountPercent, isActive } = req.body;

    if (!code || discountPercent === undefined || isActive === undefined) {
      return res.status(400).send({ message: "กรุณากรอกข้อมูลให้ครบ" });
    }

    // ✅ เพิ่มข้อมูลลง Firestore
    const ref = await addDoc(collection(db, "promotions"), {
      code,
      discountPercent,
      isActive,
      createdAt: new Date(),
    });

    res.send({
      message: "เพิ่มโปรโมชั่นสำเร็จ ✅",
      id: ref.id,
    });
  } catch (err: any) {
    console.error("❌ Error adding promotion:", err);
    res
      .status(500)
      .send({ message: "เพิ่มโปรโมชั่นไม่สำเร็จ ❌", error: err.message });
  }
});


/* -------------------------------------------------------------------------- */
/* ✅ 4.4 ป้องกันการซื้อซ้ำ (เกมที่เคยซื้อแล้วจะซื้ออีกไม่ได้)
   ✅ รวมกับ 4.3 การซื้อเกมหลายเกมต่อครั้ง (checkout)
   - ตรวจสอบรายการในตะกร้า
   - ตรวจสอบว่าเคยซื้อเกมนั้นไปแล้วหรือยัง
   - ซื้อเฉพาะเกมที่ยังไม่เคยซื้อ
   - บันทึกรายการซื้อใหม่ใน transactions
   - ลบเฉพาะสินค้าที่ซื้อสำเร็จออกจากตะกร้า
-----------------------------------------------------------------------------*/

router.post("/user_cart/checkout", async (req, res) => {
  try {
    const { userId, paymentMethod } = req.body;

    // ✅ ตรวจสอบว่าผู้ใช้กรอก userId มาหรือไม่
    if (!userId) {
      return res.status(400).send({ message: "กรุณาระบุ userId" });
    }

    /* ---------------------------------------------------------------------- */
    /* ✅ ดึงข้อมูลสินค้าในตะกร้าของผู้ใช้จาก Firestore */
    /* ---------------------------------------------------------------------- */
    const cartQuery = query(collection(db, "cart"), where("userId", "==", userId));
    const cartSnap = await getDocs(cartQuery);

    // ❌ ถ้าไม่มีสินค้าในตะกร้าเลย
    if (cartSnap.empty) {
      return res.status(404).send({ message: "ไม่มีสินค้าในตะกร้า ❌" });
    }

    // ✅ แปลงข้อมูลเอกสารใน Firestore เป็น Object ที่ใช้งานง่าย
    const cartItems = cartSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));

    /* ---------------------------------------------------------------------- */
    /* ✅ ตรวจสอบว่าเกมในตะกร้ามีเกมที่เคยซื้อแล้วหรือไม่ (ป้องกันการซื้อซ้ำ) */
    /* ---------------------------------------------------------------------- */
    const transQuery = query(collection(db, "transactions"), where("userId", "==", userId));
    const transSnap = await getDocs(transQuery);

    // ✅ สร้าง array เก็บ gameId ของเกมที่เคยซื้อแล้ว
    const purchasedGames: string[] = [];

    // ✅ ดึง gameId ทั้งหมดจากรายการซื้อก่อนหน้า
    transSnap.forEach((t) => {
      const data = t.data();
      if (data.items && Array.isArray(data.items)) {
        data.items.forEach((item: any) => {
          purchasedGames.push(item.gameId); // เช่น "game001", "game002"
        });
      }
    });

    // ✅ กรองเฉพาะเกมที่ยังไม่เคยซื้อ
    const newItems = cartItems.filter((i: any) => !purchasedGames.includes(i.gameId));

    // ❌ ถ้าเกมทั้งหมดในตะกร้าเคยซื้อไปแล้ว
    if (newItems.length === 0) {
      return res.status(400).send({ message: "คุณได้ซื้อเกมทั้งหมดนี้ไปแล้ว ❌" });
    }

    /* ---------------------------------------------------------------------- */
    /* ✅ คำนวณราคารวมของเฉพาะเกมที่ยังไม่เคยซื้อ */
    /* ---------------------------------------------------------------------- */
    const totalPrice = newItems.reduce((sum: number, i: any) => sum + (i.price ?? 0), 0);

    /* ---------------------------------------------------------------------- */
    /* ✅ สร้างข้อมูลธุรกรรม (Transaction Data) เพื่อบันทึกลง Firestore */
    /* ---------------------------------------------------------------------- */
    const transactionData = {
      userId,
      items: newItems.map((i: any) => ({
        gameId: i.gameId,
        name: i.name,
        price: i.price,
      })),
      totalPrice,
      paymentMethod: paymentMethod || "CreditCard", // ค่าเริ่มต้นคือบัตรเครดิต
      createdAt: new Date(),
      status: "Success", // สถานะการซื้อ
    };

    // ✅ เพิ่มข้อมูลธุรกรรมนี้ลงใน collection "transactions"
    await addDoc(collection(db, "transactions"), transactionData);

    /* ---------------------------------------------------------------------- */
    /* ✅ ลบเฉพาะสินค้าที่ซื้อสำเร็จออกจากตะกร้า (ไม่ลบเกมที่เคยซื้อแล้ว) */
    /* ---------------------------------------------------------------------- */
    const deletePromises = newItems.map((i: any) => deleteDoc(doc(db, "cart", i.id)));
    await Promise.all(deletePromises);

    /* ---------------------------------------------------------------------- */
    /* ✅ ส่งผลลัพธ์กลับไปให้ฝั่ง client */
    /* ---------------------------------------------------------------------- */
    res.send({
      message: "ชำระเงินสำเร็จ ✅",
      totalPrice,
      transaction: transactionData,
    });

  } catch (err: any) {
    // ❌ หากเกิดข้อผิดพลาดขณะทำงาน
    console.error("❌ Error during checkout:", err);
    res.status(500).send({
      message: "เกิดข้อผิดพลาดในการชำระเงิน ❌",
      error: err.message,
    });
  }
});


/* -------------------------------------------------------------------------- */
/* ✅ 4.5 หน้าคลังเกม (แสดงเกมที่ผู้ใช้ซื้อแล้ว - เวอร์ชันสมบูรณ์)
   - ดึงข้อมูลจาก "transactions" ของ user
   - รวมทุกเกมที่ซื้อสำเร็จ และลบเกมซ้ำตาม gameId (normalize)
   - ดึงรายละเอียดเกมจาก "games" (ชื่อ, ประเภท, รูปภาพ, รายละเอียด)
   - เรียงจากวันที่ซื้อใหม่สุด -> เก่าสุด
-----------------------------------------------------------------------------*/

router.get("/user_library/:userId", async (req, res) => {
  try {
    const { userId } = req.params;
    if (!userId)
      return res.status(400).send({ message: "กรุณาระบุ userId" });

    /* ---------------------------------------------------------------------- */
    /* ✅ ดึงธุรกรรมทั้งหมดของ user */
    /* ---------------------------------------------------------------------- */
    const transQuery = query(
      collection(db, "transactions"),
      where("userId", "==", userId)
    );
    const transSnap = await getDocs(transQuery);

    if (transSnap.empty)
      return res.status(404).send({ message: "ยังไม่มีเกมที่คุณซื้อไว้ ❌" });

    /* ---------------------------------------------------------------------- */
    /* ✅ รวมเกมทั้งหมดจากทุกธุรกรรม */
    /* ---------------------------------------------------------------------- */
    let allGames: any[] = [];
    transSnap.forEach((t) => {
      const data = t.data();
      if (data.items && Array.isArray(data.items)) {
        data.items.forEach((item: any) => {
          allGames.push({
            ...item,
            createdAt: data.createdAt || new Date(), // เก็บวันที่ซื้อ
          });
        });
      }
    });

    /* ---------------------------------------------------------------------- */
    /* ✅ ลบเกมซ้ำ (normalize ด้วย trim().toLowerCase()) */
    /* ---------------------------------------------------------------------- */
    const uniqueGamesMap = new Map<string, any>();
    allGames.forEach((g) => {
      if (g.gameId) {
        const normalizedId = g.gameId.trim().toLowerCase();
        if (!uniqueGamesMap.has(normalizedId)) {
          uniqueGamesMap.set(normalizedId, g);
        }
      }
    });

    const uniqueGames = Array.from(uniqueGamesMap.values());

    /* ---------------------------------------------------------------------- */
    /* ✅ ดึงรายละเอียดเกมจาก collection "games" */
    /* ---------------------------------------------------------------------- */
    const detailedGames = await Promise.all(
      uniqueGames.map(async (g) => {
        try {
          const gameRef = doc(db, "games", g.gameId);
          const gameSnap = await getDoc(gameRef);
          if (gameSnap.exists()) {
            const gameData = gameSnap.data();
            return {
              ...g,
              category: gameData.category || "",
              description: gameData.description || "",
              imageUrl: gameData.imageUrl || "",
            };
          }
          return g;
        } catch (error) {
          console.warn("⚠️ ดึงรายละเอียดเกมไม่สำเร็จ:", error);
          return g;
        }
      })
    );

    /* ---------------------------------------------------------------------- */
    /* ✅ เรียงจากวันที่ซื้อล่าสุด -> เก่าสุด */
    /* ---------------------------------------------------------------------- */
    detailedGames.sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );

    /* ---------------------------------------------------------------------- */
    /* ✅ ส่งผลลัพธ์กลับ */
    /* ---------------------------------------------------------------------- */
    res.send({
      message: "ดึงข้อมูลคลังเกมสำเร็จ ✅",
      count: detailedGames.length,
      purchasedGames: detailedGames,
    });
  } catch (err: any) {
    console.error("❌ Error loading library:", err);
    res.status(500).send({
      message: "เกิดข้อผิดพลาดในการดึงคลังเกม ❌",
      error: err.message,
    });
  }
});




/* -------------------------------------------------------------------------- */
/* ✅ 4.6 ดูรายละเอียดเกมจากคลังที่ซื้อแล้ว (เฉพาะเกมที่ user เคยซื้อ) */
/* -------------------------------------------------------------------------- */
router.get("/user_library/detail/:gameId", async (req, res) => {
  try {
    const { gameId } = req.params;

    if (!gameId) {
      return res.status(400).send({ message: "กรุณาระบุ gameId" });
    }

    // ✅ ดึงข้อมูลจาก collection "games"
    const gameRef = doc(db, "games", gameId);
    const gameSnap = await getDoc(gameRef);

    if (!gameSnap.exists()) {
      return res.status(404).send({ message: "ไม่พบข้อมูลเกมนี้ ❌" });
    }

    const gameData = gameSnap.data();

    res.send({
      message: "ดึงรายละเอียดเกมสำเร็จ ✅",
      game: {
        id: gameSnap.id,
        name: gameData.name,
        category: gameData.category,
        price: gameData.price,
        description: gameData.description || "",
        imageUrl: gameData.imageUrl || "",
        releaseDate: gameData.releaseDate || "",
        createdAt: gameData.createdAt || "",
      },
    });
  } catch (err: any) {
    console.error("❌ Error loading game detail:", err);
    res.status(500).send({
      message: "เกิดข้อผิดพลาดในการดึงรายละเอียดเกม ❌",
      error: err.message,
    });
  }
});



/* -------------------------------------------------------------------------- */
/* ✅ 4.7 การจัดอันดับเกมขายดี (Top Ranking ≥5 อันดับ)
   - ดึงข้อมูลจาก transactions
   - นับจำนวนครั้งที่แต่ละเกมถูกซื้อ
   - รวมยอดขาย (revenue)
   - จัดเรียงจากขายมากสุด → น้อยสุด
   - แสดงอย่างน้อย 5 อันดับ
-----------------------------------------------------------------------------*/
router.get("/ranking/top-games", async (req, res) => {
  try {
    // ✅ ดึงข้อมูลธุรกรรมทั้งหมดจาก Firestore
    const transSnap = await getDocs(collection(db, "transactions"));

    if (transSnap.empty) {
      return res.status(404).send({ message: "ยังไม่มีข้อมูลการซื้อเกม ❌" });
    }

    // ✅ เก็บยอดขายแต่ละเกม (จำนวนครั้ง และรายได้รวม)
    const salesMap: Record<
      string,
      { name: string; count: number; totalRevenue: number }
    > = {};

    transSnap.forEach((t) => {
      const data = t.data();
      if (data.items && Array.isArray(data.items)) {
        data.items.forEach((item: any) => {
          const { gameId, name, price } = item;
          if (!salesMap[gameId]) {
            salesMap[gameId] = { name, count: 0, totalRevenue: 0 };
          }
          salesMap[gameId].count += 1;
          salesMap[gameId].totalRevenue += price ?? 0;
        });
      }
    });

    // ✅ แปลงเป็น array เพื่อเรียงลำดับ
    const ranking = Object.entries(salesMap)
      .map(([gameId, data]) => ({
        gameId,
        name: data.name,
        soldCount: data.count,
        totalRevenue: data.totalRevenue,
      }))
      .sort((a, b) => b.soldCount - a.soldCount) // เรียงจากขายมากสุด → น้อยสุด
      .slice(0, 5); // แสดงแค่ 5 อันดับแรก

    // ✅ ส่งผลลัพธ์กลับ
    res.send({
      message: "ดึงอันดับเกมขายดีสำเร็จ ✅",
      count: ranking.length,
      ranking,
    });
  } catch (err: any) {
    console.error("❌ Error ranking games:", err);
    res.status(500).send({
      message: "เกิดข้อผิดพลาดในการจัดอันดับเกม ❌",
      error: err.message,
    });
  }
});




// 5.1 Admin กำหนดโค้ดส่วนลด (เพิ่ม/ลบ/แก้ไข)
router.post("/admin/discount/add", async (req, res) => {
  try {
    const { code, discountPercent, usageLimit, expiredAt } = req.body;

    if (!code || !discountPercent)
      return res.status(400).send({ message: "กรุณาระบุ code และ discountPercent" });

    await addDoc(collection(db, "discount_codes"), {
      code: code.toUpperCase(),
      discountPercent,
      usageLimit: usageLimit || 1,
      usedCount: 0,
      expiredAt: expiredAt ? new Date(expiredAt) : null,
      active: true,
      usersUsed: [],
      createdAt: new Date(),
    });

    res.send({ message: "เพิ่มโค้ดส่วนลดสำเร็จ ✅" });
  } catch (err: any) {
    res.status(500).send({ message: "เกิดข้อผิดพลาด", error: err.message });
  }
});



router.put("/admin/discount/:code", async (req, res) => {
  try {
    const code = req.params.code;
    const updateData = req.body;

    // ✅ ค้นหาโค้ดใน Firestore
    const q = query(
      collection(db, "discount_codes"),
      where("code", "==", code.toUpperCase())
    );
    const snap = await getDocs(q);

    if (snap.empty)
      return res.status(404).send({ message: "ไม่พบโค้ดนี้ ❌" });

    // ✅ ใช้ id ของเอกสารแทนการใช้ .ref
    const docId = (snap.docs[0] as any).id;
    const docRef = doc(db, "discount_codes", docId);

    // ✅ อัปเดตข้อมูล
    await updateDoc(docRef, updateData);

    res.send({ message: "แก้ไขโค้ดสำเร็จ ✅" });
  } catch (err: any) {
    console.error("❌ Error updating discount:", err);
    res
      .status(500)
      .send({ message: "เกิดข้อผิดพลาด", error: err.message });
  }
});


/* -------------------------------------------------------------------------- */
/* ✅ 5.3–5.4 การใช้โค้ดส่วนลดในตะกร้า (User Apply Discount)
   - ตรวจสอบว่าโค้ดมีอยู่หรือไม่
   - ตรวจสอบหมดอายุ (expiredAt)
   - ตรวจสอบจำนวนครั้งที่ใช้ได้ (usageLimit)
   - ตรวจสอบว่า user เคยใช้โค้ดนี้แล้วหรือยัง
   - คำนวณราคาหลังหักส่วนลด
   - บันทึกจำนวนการใช้งาน (usedCount +1)
   - ปิดโค้ด (active=false) เมื่อหมดอายุหรือครบ limit
-----------------------------------------------------------------------------*/

router.post("/user_cart/apply_discount", async (req, res) => {
  try {
    const { userId, promoCode } = req.body;

    if (!userId || !promoCode) {
      return res.status(400).send({ message: "กรุณาระบุ userId และ promoCode" });
    }

    /* ---------------------------------------------------------------------- */
    /* ✅ ค้นหาโค้ดใน Firestore */
    /* ---------------------------------------------------------------------- */
    const q = query(collection(db, "discount_codes"), where("code", "==", promoCode.toUpperCase()));
    const snap = await getDocs(q);

    if (snap.empty) {
      return res.status(404).send({ message: "ไม่พบโค้ดส่วนลดนี้ ❌" });
    }

    const docRef = (snap.docs[0] as any).ref;
    const promo = (snap.docs[0] as any).data();

    /* ---------------------------------------------------------------------- */
    /* ✅ ตรวจสอบสถานะโค้ด */
    /* ---------------------------------------------------------------------- */
    if (!promo.active) {
      return res.status(400).send({ message: "โค้ดนี้ถูกปิดการใช้งานแล้ว ❌" });
    }

    // ตรวจสอบวันหมดอายุ
    if (promo.expiredAt && promo.expiredAt.toDate && promo.expiredAt.toDate() < new Date()) {
      await updateDoc(docRef, { active: false });
      return res.status(400).send({ message: "โค้ดนี้หมดอายุแล้ว ❌" });
    }

    // ตรวจสอบจำนวนการใช้งานเกิน limit
    if (promo.usageLimit && promo.usedCount >= promo.usageLimit) {
      await updateDoc(docRef, { active: false });
      return res.status(400).send({ message: "โค้ดนี้ถูกใช้ครบจำนวนแล้ว ❌" });
    }

    // ตรวจสอบว่า user เคยใช้โค้ดนี้ไปแล้วหรือยัง
    if (promo.usersUsed && promo.usersUsed.includes(userId)) {
      return res.status(400).send({ message: "คุณเคยใช้โค้ดนี้แล้ว ❌" });
    }

    /* ---------------------------------------------------------------------- */
    /* ✅ ดึงตะกร้าของผู้ใช้มาคำนวณราคา */
    /* ---------------------------------------------------------------------- */
    const cartQuery = query(collection(db, "cart"), where("userId", "==", userId));
    const cartSnap = await getDocs(cartQuery);

    if (cartSnap.empty) {
      return res.status(404).send({ message: "ไม่มีสินค้าในตะกร้า ❌" });
    }

    const cartItems = cartSnap.docs.map((d) => d.data());
    const totalPrice = cartItems.reduce((sum, i) => sum + (i.price ?? 0), 0);

    /* ---------------------------------------------------------------------- */
    /* ✅ คำนวณส่วนลด */
    /* ---------------------------------------------------------------------- */
    const discountPercent = promo.discountPercent ?? 0;
    const discount = (totalPrice * discountPercent) / 100;
    const finalPrice = totalPrice - discount;

    /* ---------------------------------------------------------------------- */
    /* ✅ อัปเดตสถานะโค้ด (เพิ่มจำนวนการใช้งาน และจำว่า user คนนี้ใช้แล้ว) */
    /* ---------------------------------------------------------------------- */
    const newUsedCount = (promo.usedCount || 0) + 1;
    const updatedUsers = [...(promo.usersUsed || []), userId];

    await updateDoc(docRef, {
      usedCount: newUsedCount,
      usersUsed: updatedUsers,
      active:
        promo.usageLimit && newUsedCount >= promo.usageLimit
          ? false
          : promo.active,
    });

    /* ---------------------------------------------------------------------- */
    /* ✅ ส่งผลลัพธ์กลับ */
    /* ---------------------------------------------------------------------- */
    res.send({
      message: `ใช้โค้ดส่วนลด ${promoCode} สำเร็จ ✅`,
      discountPercent,
      totalPrice,
      discount,
      finalPrice,
    });
  } catch (err: any) {
    console.error("❌ Error applying discount:", err);
    res.status(500).send({
      message: "เกิดข้อผิดพลาดในการใช้โค้ดส่วนลด ❌",
      error: err.message,
    });
  }
});






































