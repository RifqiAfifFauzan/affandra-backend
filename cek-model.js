import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';
dotenv.config();

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

async function cekModels() {
  console.log("Mencari model yang tersedia untuk API Key ini...");
  try {
    const response = await ai.models.list();
    for await (const model of response) {
       console.log(`- ${model.name}`);
    }
  } catch (error) {
    console.error("Gagal mengambil daftar model:", error.message);
  }
}
cekModels();