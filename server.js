import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import Groq from 'groq-sdk';
import multer from 'multer';
import { GoogleGenAI } from '@google/genai';
import pg from 'pg';

// 1. Panggil dotenv sebelum memanggil yang lain
dotenv.config();

const { Pool } = pg;

// 2. Koneksi pool PostgreSQL (Supabase)
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

// Fungsi untuk inisialisasi tabel database (dengan kolom lengkap)
async function initDB() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS sessions (
        id VARCHAR(255) PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        user_id VARCHAR(255),
        creation_time_ms BIGINT,
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
initDB();

// Solusi untuk mengimpor modul CommonJS (pdf-parse) ke ESM
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const pdfParse = require('pdf-parse');

const app = express();

// Longgarkan CORS dan atur limit body parser agar muat file gambar
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

// Inisialisasi DUA Mesin AI sekaligus!
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// Konfigurasi Multer menggunakan memoryStorage (AMAN untuk Vercel Serverless)
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
      
      // Sanitasi riwayat pesan
      const sanitizedHistory = parsedHistory.map(msg => ({
        role: msg.role === 'model' || msg.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: msg.parts?.[0]?.text || msg.content || '' }]
      })).slice(-4);

      // Gunakan format pemanggilan standar SDK @google/genai terbaru
      const response = await ai.models.generateContent({
        model: 'gemini-2.0-flash', 
        contents: [
          ...sanitizedHistory,
          {
            role: 'user',
            parts: [
              { text: message || "Tolong jelaskan gambar ini secara detail." },
              {
                inlineData: {
                  data: base64Image,
                  mimeType: file.mimetype
                }
              }
            ]
          }
        ],
        config: {
          systemInstruction: systemPromptRifqi
        }
      });
      
      aiReply = response.text || "Maaf, aku tidak bisa membaca gambar tersebut.";
    }
    
    // --- LOGIKA 2: JIKA TEKS BIASA ATAU FILE PDF (Gunakan Otak Groq) ---
    else {
      const formattedHistory = parsedHistory.map(msg => ({
        role: msg.role === 'model' || msg.role === 'assistant' ? 'assistant' : 'user',
        content: msg.parts?.[0]?.text || msg.content || ''
      }));

      const limitedHistory = formattedHistory.slice(-10);

      const messages = [
        {
          role: "system",
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
        [sessionId, 'user', message || "[Mengirim Lampiran File/Gambar]"]
      );

      await pool.query(
        'INSERT INTO messages (session_id, role, content) VALUES ($1, $2, $3)',
        [sessionId, 'model', aiReply]
      );
    }

    res.json({ reply: aiReply, limit: sisaLimit });

} catch (error) {
    console.error("DETAIL ERROR PADA SERVER:", error);
    
    if (error.status === 429) {
      return res.status(429).json({ 
        error: `Pesanmu sudah limit. Silakan coba beberapa saat lagi.` 
      });
    }

    if (error.status === 503) {
      return res.status(503).json({
        error: "Server pemrosesan gambar sedang penuh. Silakan coba lagi."
      });
    }
    
    // INI AKAN MENAMPILKAN ERROR ASLI KE CHAT SUPAYA KITA TAHU PENYEBABNYA
    res.status(500).json({ error: `DEBUG ERROR: ${error.message || JSON.stringify(error)}` });
  }
});

// Jalankan secara lokal jika bukan di server Vercel
if (process.env.NODE_ENV !== 'production') {
  const PORT = process.env.PORT || 3001;
  app.listen(PORT, () => {
    console.log(`Server lokal berjalan di port ${PORT}`);
  });
}

// Wajib diekspor agar bisa dibaca oleh Vercel Serverless Function
export default app;