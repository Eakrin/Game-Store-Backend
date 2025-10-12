import express from "express";
import {
  addDoc,
  collection,
  doc,
  getDocs,
  orderBy,
  query,
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
router.post("/wallet_topup", async (req, res) => {
  try {
    const { userId, amount } = req.body;

    // ✅ ตรวจสอบข้อมูล
    if (!userId || amount === undefined)
      return res.status(400).send({ message: "กรุณาระบุ userId และจำนวนเงิน" });

    if (amount <= 0)
      return res.status(400).send({ message: "จำนวนเงินต้องมากกว่า 0" });

    // 🔹 อ้างอิงกระเป๋าใน Firestore
    const walletRef = doc(db, "wallets", userId);
    const walletSnap = await getDoc(walletRef);

    let newBalance = amount;

    if (!walletSnap.exists()) {
      // 🔹 ถ้ายังไม่มีกระเป๋า ให้สร้างใหม่
      await setDoc(walletRef, {
        balance: amount,
        lastUpdated: new Date(),
      });
    } else {
      // 🔹 ถ้ามีอยู่แล้ว → บวกยอดเก่า
      const currentBalance = walletSnap.data().balance ?? 0;
      newBalance = currentBalance + amount;

      await updateDoc(walletRef, {
        balance: newBalance,
        lastUpdated: new Date(),
      });
    }

    // ✅ เพิ่มธุรกรรมลงใน Collection "transactions"
    await addDoc(collection(db, "transactions"), {
      userId,
      type: "topup",
      amount,
      detail: "เติมเงินผ่านระบบ",
      createdAt: new Date(),
    });

    res.send({
      message: "เติมเงินสำเร็จ ✅",
      balance: newBalance,
      added: amount,
    });
  } catch (err: any) {
    console.error("❌ Error top-up:", err);
    res.status(500).send({
      message: "เกิดข้อผิดพลาดในการเติมเงิน ❌",
      error: err.message,
    });
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





































