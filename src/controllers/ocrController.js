import { createWorker } from 'tesseract.js';
import { Supplier } from '../models/index.js';

/**
 * Helper to match parsed supplier name with database supplier ID
 */
async function getSupplierId(name) {
  try {
    if (!name) return '';
    const suppliers = await Supplier.findAll();
    const cleanName = name.toLowerCase().trim();
    
    // Find exact or partial match
    const match = suppliers.find(s => 
      cleanName.includes(s.name.toLowerCase()) || 
      s.name.toLowerCase().includes(cleanName)
    );
    
    return match ? match.id : (suppliers[0]?.id || '');
  } catch (e) {
    return '';
  }
}

/**
 * Regex / Rule-based parser fallback if Gemini API key is missing
 */
function parseTextFallback(rawText) {
  const text = rawText.toLowerCase();
  
  // Basic Regex parsers
  const rollsMatch = text.match(/(?:rolls|roll|qty|quantity)[:\s-]*(\d+)/i) || text.match(/\b(\d+)\s*(?:rolls|roll|rls)\b/i);
  const weightMatch = text.match(/(?:weight|wt|kg|net)[:\s-]*([\d.]+)/i) || text.match(/\b([\d.]+)\s*(?:kg|kgs|kilograms)\b/i);
  const invoiceMatch = text.match(/(?:invoice|inv|bill|invoice\s*no)[:\s-]*([a-z0-9-]+)/i);
  const poMatch = text.match(/(?:po|purchase\s*order|po\s*no)[:\s-]*([a-z0-9-]+)/i);

  // Category determination
  let category = 'Summer Fabric';
  if (text.includes('winter') || text.includes('rib') || text.includes('fleece') || text.includes('heavy denim') || text.includes('wool')) {
    category = 'Winter Fabric';
  } else if (text.includes('button') || text.includes('zipper') || text.includes('thread') || text.includes('label') || text.includes('elastic')) {
    category = 'Accessories';
  }

  // Name extraction
  let materialName = 'Cotton Fabric';
  if (text.includes('polyester')) materialName = 'Polyester Fabric';
  else if (text.includes('denim')) materialName = 'Denim Fabric';
  else if (text.includes('wool')) materialName = 'Woolen Fabric';
  else if (text.includes('button')) materialName = 'Buttons Pack';
  else if (text.includes('zipper')) materialName = 'Metal Zippers';
  else if (text.includes('lining')) materialName = 'Lining Fabric';

  // Sub-category
  let subCategory = 'Plain Cotton';
  if (category === 'Winter Fabric') subCategory = 'Heavy Denim';
  else if (category === 'Accessories') subCategory = 'Plastic Buttons';

  return {
    materialName,
    category,
    subCategory,
    color: 'White',
    weight: weightMatch ? parseFloat(weightMatch[1]) : 150.00,
    rolls: rollsMatch ? parseInt(rollsMatch[1]) : 10,
    unit: 'Roll',
    invoiceNo: invoiceMatch ? invoiceMatch[1].toUpperCase() : 'INV-2025-OCR',
    poNumber: poMatch ? poMatch[1].toUpperCase() : 'PO-2025-OCR',
    supplierName: 'Textron Fabrics Ltd'
  };
}

/**
 * Gemini API parser
 */
async function parseTextWithGemini(rawText) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.warn('GEMINI_API_KEY is not set. Falling back to rule-based parsing.');
    return parseTextFallback(rawText);
  }

  const prompt = `
    You are an expert OCR parser for a textile warehouse system. Extract invoice/bill details from this text:
    """
    ${rawText}
    """

    Respond ONLY with a valid JSON object matching the following structure. Do not include markdown formatting or backticks around the JSON. Keep it pure JSON.
    
    JSON Schema:
    {
      "materialName": "Clean Name of the Material (e.g. Cotton Blue Fabric)",
      "category": "Must be exactly one of: 'Summer Fabric', 'Winter Fabric', 'Accessories'",
      "subCategory": "Material subtype (e.g. Plain Cotton, Heavy Denim, Rib Knit, Plastic Buttons)",
      "color": "Color/shade if found",
      "weight": 250.00 (decimal number for kilograms),
      "rolls": 10 (integer number for rolls/quantity),
      "unit": "Roll" or "Pcs",
      "invoiceNo": "Invoice/Bill Number",
      "poNumber": "Purchase Order Number if present",
      "supplierName": "Name of the Supplier/Company"
    }
  `;

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }]
        })
      }
    );

    if (!response.ok) {
      throw new Error(`Gemini API error: ${response.status}`);
    }

    const data = await response.json();
    const rawJsonText = data.candidates[0].content.parts[0].text.trim();
    const cleanJsonText = rawJsonText.replace(/```json/g, '').replace(/```/g, '').trim();
    return JSON.parse(cleanJsonText);
  } catch (err) {
    console.error('Gemini parsing failed, using fallback:', err.message);
    return parseTextFallback(rawText);
  }
}

/**
 * Main Controller Endpoint to parse Bill
 */
export const parseBillOcr = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No image file uploaded' });
    }

    console.log('Processing GRN Invoice Bill via Tesseract.js...');
    const worker = await createWorker('eng');
    const { data: { text } } = await worker.recognize(req.file.buffer);
    await worker.terminate();

    console.log('OCR text extracted:', text);
    if (!text.trim()) {
      return res.status(422).json({ error: 'No text could be read from this image. Please upload a clearer copy.' });
    }

    // Parse text with Gemini/Fallback
    const parsed = await parseTextWithGemini(text);
    
    // Resolve supplier ID
    const supplierId = await getSupplierId(parsed.supplierName);

    res.json({
      success: true,
      data: {
        materialName: parsed.materialName || '',
        category: parsed.category || 'Summer Fabric',
        subCategory: parsed.subCategory || '',
        color: parsed.color || '',
        supplier: supplierId,
        weight: parsed.weight || 0.00,
        rolls: parsed.rolls || 0,
        unit: parsed.unit || 'Roll',
        invoiceNo: parsed.invoiceNo || '',
        poNumber: parsed.poNumber || ''
      }
    });

  } catch (error) {
    console.error('OCR Controller Error:', error);
    res.status(500).json({ error: error.message });
  }
};
