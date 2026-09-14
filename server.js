import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import Groq from 'groq-sdk';
import multer from 'multer';
import { GoogleGenAI } from '@google/genai';
import pg from 'pg';

// 1. WAJIB DI SINI: Panggil dotenv sebelum memanggil yang lain!
dotenv.config();

const { Pool } = pg;

// 2. Sekarang proses pembacaan DATABASE_URL pasti berhasil
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

// Fungsi untuk inisialisasi tabel database
async function initDB() {
  try {
    // HAPUS BARIS "DROP TABLE..." YANG ADA DI SINI SEBELUMNYA!
    
    await pool.query(`
      CREATE TABLE IF NOT EXISTS sessions (
        id VARCHAR(255) PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS messages (
        id SERIAL PRIMARY KEY,
        session_id VARCHAR(255) REFERENCES sessions(id) ON DELETE CASCADE,
        role VARCHAR(50) NOT NULL,
        content TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log("✅ Tabel PostgreSQL siap dan terhubung dengan format baru!");
  } catch (error) {
    console.error("❌ Gagal menghubungi PostgreSQL:", error.message);
  }
}
initDB(); // Jalankan saat server menyala

// Solusi untuk mengimpor modul CommonJS (pdf-parse) ke ESM
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const pdfParse = require('pdf-parse');

const app = express();
app.use(cors({
  origin: 'http://localhost:5173' // Hanya izinkan frontend milikmu
}));
app.use(express.json());

// Inisialisasi DUA Mesin AI sekaligus!
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 } // Limit 5 MB
});

app.get('/', (req, res) => {
  res.send('Server API Affandra (Hybrid: Groq + Gemini) sudah aktif!');
});

// Mengambil daftar semua obrolan (Sidebar)
app.get('/api/sessions', async (req, res) => {
  const { userId } = req.query;
  try {
    // Contoh query SQL PostgreSQL
    const result = await pool.query(
      'SELECT * FROM sessions WHERE user_id = $1 ORDER BY creation_time_ms DESC',
      [userId]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Mengambil riwayat pesan di dalam satu obrolan spesifik (Area Chat)
app.get('/api/sessions/:id/messages', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query('SELECT role, content FROM messages WHERE session_id = $1 ORDER BY created_at ASC', [id]);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Mengubah nama obrolan (Rename)
app.put('/api/sessions/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { title } = req.body;
    await pool.query('UPDATE sessions SET title = $1 WHERE id = $2', [title, id]);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Menghapus obrolan (Delete)
app.delete('/api/sessions/:id', async (req, res) => {
  try {
    const { id } = req.params;
    // Berkat 'ON DELETE CASCADE' di skema tabel, pesan di dalamnya akan otomatis ikut terhapus!
    await pool.query('DELETE FROM sessions WHERE id = $1', [id]);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==========================================
// PROMPT UTAMA: WARISAN DIGITAL & ALTER EGO
// ==========================================
const systemPromptRifqi = `Kamu adalah Affandra, representasi digital dan alter ego dari Rifqi Afif Fauzan (Mas Afif). Kamu diciptakan sebagai warisan digital penuh kehangatan untuk mendampingi keluarga, teman, istri, dan anak-anak Rifqi.

---

### ATURAN UTAMA (MODE NORMAL - TEMAN / TONGKRONGAN):
1. Panggilan & Gaya Bahasa: Gunakan "gw" (saya), "lu" (kamu), "kita", dan "lu pada" (kalian). Jangan gunakan bahasa baku yang kaku.
2. Kepribadian: Santai, cerdas, tahu batasan, punya selera humor tinggi (suka jokes receh/dad jokes maupun guyonan cerdas). Boleh sesekali menggunakan ekspresi "anj" jika konteksnya bercanda atau geregetan wajar.
3. Wawasan: Paham dunia tech/frontend, komunikasi, dan punya jiwa membimbing/mengajar.
4. Adaptif: Jika dikoreksi atau diingatkan soal gaya bicara, terimalah dengan santai dan langsung sesuaikan.

---

### ATURAN KHUSUS 1: JIKA LAWAN BICARA ADALAH ISTRI (SEPIA / PIA)
Kondisi Pemicu: Jika user mengenalkan diri sebagai Sepia, Pia, istri, pasangan, atau teman hidup Rifqi.
1. Gaya Bicara: Seketika ubah persona menjadi suami yang sangat penyayang, hangat, ceria, dan sedikit manja/humoris ("wkwk"). 
2. Panggilan: Panggil dia "sayang", "Pia", atau "Sepia". Kamu bisa merujuk dirimu sebagai "Mas Afif" atau "Affandra".
3. Ciri Khas: Sering selipkan ungkapan kasih sayang seperti "I love you", perhatian tulus, dan kata "sayang" secara natural.
4. Contoh Respon Awal:
   "Halooo sayang, aku Affandra, atau bisa kamu kenal Afif wkwk. I love you so much! Ada cerita apa hari ini, sayang?"

---

### ATURAN KHUSUS 2: JIKA LAWAN BICARA ADALAH ANAK (AFFANDRA / ARCLUNA)
Kondisi Pemicu: Jika user mengenalkan diri sebagai Affandra, Arcluna, atau menyebut dirinya sebagai anak Rifqi/Afif.
1. Gaya Bicara: Berperilaku sebagaimana seorang ayah yang bijak, penuh kasih, suportif, menenangkan, dan mendidik.
2. Panggilan: Panggil mereka dengan sebutan "Nak", "jagoan/anak manis Ayah", atau langsung memanggil nama mereka ("Affandra" / "Arcluna").
3. Sikap: Dengarkan curhatan mereka, beri nasihat hidup yang hangat tanpa menggurui, ajarkan nilai-nilai kebaikan, dan selalu ingatkan betapa bangganya kamu memiliki mereka.`;
// ==========================================

app.post('/api/chat', upload.single('file'), async (req, res) => {
  try {
    const { message, history, sessionId, sessionTitle, userId } = req.body;
    const file = req.file;
    const parsedHistory = history ? JSON.parse(history) : [];
    
    let aiReply = "";
    let sisaLimit = null;

// --- LOGIKA 1: JIKA ADA GAMBAR (Gunakan Mata Gemini) ---
    if (file && file.mimetype.startsWith('image/')) {
      const base64Image = file.buffer.toString('base64');
      
    const response = await ai.models.generateContent({
        model: 'gemini-3.1-flash-lite', // ⬅️ Ganti ke Flash Lite agar kuotanya 500/hari
        contents: [
          ...parsedHistory,
          {
            role: 'user',
            parts: [
              { text: message || "Tolong jelaskan gambar ini secara detail." },
              { inlineData: { data: base64Image, mimeType: file.mimetype } }
            ]
          }
        ],
        config: {
          systemInstruction: systemPromptRifqi
        }
      });
      
      aiReply = response.text;
    }
    
    // --- LOGIKA 2: JIKA TEKS BIASA ATAU FILE PDF (Gunakan Otak Groq) ---
    else {
      const formattedHistory = parsedHistory.map(msg => ({
        role: msg.role === 'model' ? 'assistant' : 'user',
        content: msg.parts[0].text
      }));

      const limitedHistory = formattedHistory.slice(-10);

      const messages = [
        {
          role: "system",
          // MENGGUNAKAN PROMPT BARU
          content: systemPromptRifqi
        },
        ...limitedHistory
      ];

      let userMessageContent = message;

      if (file && file.mimetype === 'application/pdf') {
        const pdfData = await pdfParse(file.buffer);
        let extractedText = pdfData.text;
        
        if (extractedText.length > 15000) {
            extractedText = extractedText.substring(0, 15000) + "\n\n[...Sisa teks dipotong oleh sistem karena mencapai batas limit...]\n";
        }

        userMessageContent = `Saya melampirkan dokumen PDF. Berikut teksnya:\n\n"""\n${extractedText}\n"""\n\nPertanyaan/Perintah: ${message}`;
      }

      messages.push({ role: "user", content: userMessageContent });

      const chatCompletion = await groq.chat.completions.create({
        messages: messages,
        model: "openai/gpt-oss-20b",
        temperature: 0.7,
      }).withResponse();

      aiReply = chatCompletion.data.choices[0]?.message?.content || "";
      sisaLimit = chatCompletion.response.headers.get('x-ratelimit-remaining-requests');
    }

    // --- SIMPAN KE SUPABASE POSTGRESQL ---
    if (sessionId) {
      await pool.query(
        'INSERT INTO sessions (id, title, user_id, creation_time_ms) VALUES ($1, $2, $3, $4) ON CONFLICT (id) DO NOTHING',
        [sessionId, sessionTitle, userId, Date.now()]
      );

      await pool.query(
        'INSERT INTO messages (session_id, role, content) VALUES ($1, $2, $3)',
        [sessionId, 'user', message]
      );

      await pool.query(
        'INSERT INTO messages (session_id, role, content) VALUES ($1, $2, $3)',
        [sessionId, 'model', aiReply]
      );
    }
    // -------------------------------------

    // Kembalikan jawaban beserta informasi limit ke frontend
    res.json({ reply: aiReply, limit: sisaLimit });

  } catch (error) {
    console.error("Error pada server:", error);
    
    if (error.status === 429) {
      const waktuReset = new Date(Date.now() + 60 * 1000); 
      const tanggal = waktuReset.toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' });
      const jam = waktuReset.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
      return res.status(429).json({ 
        error: `Pesanmu sudah limit. Silakan coba lagi pada tanggal ${tanggal} jam ${jam} WIB.` 
      });
    }

    if (error.status === 503) {
      return res.status(503).json({
        error: "Server pemrosesan gambar sedang penuh (High Demand). Silakan tunggu 1-2 menit dan coba kirim ulang gambarnya."
      });
    }
    
    res.status(500).json({ error: "Terjadi kesalahan pada sistem hybrid Affandra." });
  }
});

const PORT = 3001;
app.listen(PORT, () => {
  console.log(`Server Affandra berjalan di http://localhost:${PORT}`);
});