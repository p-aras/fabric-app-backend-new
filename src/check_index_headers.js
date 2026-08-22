import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
dotenv.config();

const BUDGET_SHEET_ID = "1Hj3JeJEKB43aYYWv8gk2UhdU6BWuEQfCg5pBlTdBMNA";
const API_KEY = "AIzaSyAomDFBkOySlIxKWSKGHe6ATv9gvaBr7uk";
const INDEX_SHEET_NAME = "Index";
const INDEX_RANGE = `${INDEX_SHEET_NAME}!A1:Z10`;

async function fetchSheet(range) {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${BUDGET_SHEET_ID}/values/${encodeURIComponent(range)}?key=${API_KEY}`;
  const response = await fetch(url);
  return await response.json();
}

async function inspect() {
  const data = await fetchSheet(INDEX_RANGE);
  console.log('Index sheet rows:');
  console.log(JSON.stringify(data.values, null, 2));
}

inspect();
