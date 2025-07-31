
import { GoogleGenAI, GenerateContentResponse, Part, GroundingChunk, Type } from "@google/genai";
import { GEMINI_MODEL_TEXT, GEMINI_MODEL_VISION } from '../constants';
import { ExtractedData } from "../types";
import { normalizeSubmissionUrl } from '../utils/urlUtils';
import { convertPersianToWesternNumerals } from "../utils/persianTools";

const API_KEY = process.env.API_KEY;
let ai: GoogleGenAI | null = null;

const GEMINI_CLIENT_INIT_ERROR_MESSAGE = "کلاینت Gemini API مقداردهی اولیه نشده است. این مشکل احتمالاً به دلیل عدم وجود یا نامعتبر بودن API_KEY در متغیرهای محیطی (process.env.API_KEY) است. لطفاً اطمینان حاصل کنید که این متغیر به درستی در محیط برنامه شما پیکربندی شده باشد. قابلیت‌های هوش مصنوعی غیرفعال خواهند بود.";

if (API_KEY && API_KEY.trim() !== "") {
  try {
    ai = new GoogleGenAI({ apiKey: API_KEY });
    console.info("Gemini API client initialized successfully using API_KEY from environment.");
  } catch (error) {
    console.error(
      "CRITICAL: Error initializing GoogleGenAI client with API_KEY from environment variables.\n" +
      "AI features will likely be disabled. Please check the API_KEY and your network connection.\n",
      error
    );
    // ai remains null
  }
} else {
  console.error(
    "CRITICAL: API_KEY for Gemini is not set or is empty in environment variables (process.env.API_KEY).\n" +
    "AI features will be disabled. Please ensure the API_KEY environment variable is correctly configured."
  );
  // ai remains null
}

export const GENERAL_ANALYSIS_TOPIC_VALUE = "__GENERAL__";

const escapeStringForTemplateLiteral = (str: string | undefined | null): string => {
  if (str === undefined || str === null) return '';
  return String(str) // Ensure it's a string
    .replace(/\\/g, '\\\\') // Escape backslashes first
    .replace(/`/g, '\\`')  // Escape backticks
    .replace(/\$\{/g, '\\${'); // Escape ${
};

const cleanJsonString = (jsonStr: string): string => {
  let cleaned = jsonStr.trim();

  // Regex to find a JSON markdown block anywhere in the string and extract its content.
  // It looks for ```, optional language specifier, then captures everything from the first { to the last }
  const fenceRegex = /```(?:json)?\s*(\{[\s\S]*\})\s*```/;
  const matchFence = cleaned.match(fenceRegex);

  if (matchFence && matchFence[1]) {
    // If a markdown block is found, return its content
    return matchFence[1].trim();
  }

  // If no markdown block is found, fall back to finding the first '{' and the last '}'.
  // This is useful if the model forgets the markdown fences.
  const startIndex = cleaned.indexOf('{');
  const endIndex = cleaned.lastIndexOf('}');
  
  if (startIndex !== -1 && endIndex !== -1 && endIndex > startIndex) {
    return cleaned.substring(startIndex, endIndex + 1);
  }

  // If no JSON object can be reliably found, return the original string.
  // This allows the calling function's JSON.parse to fail with a clear error message
  // about what it attempted to parse.
  return cleaned;
};

export async function extractTextFromImageViaGemini(base64ImageData: string, mimeType: string, signal?: AbortSignal): Promise<string> {
  if (!ai) {
    throw new Error(GEMINI_CLIENT_INIT_ERROR_MESSAGE);
  }
  if (signal?.aborted) {
    throw new DOMException('Operation aborted by user', 'AbortError');
  }

  const imagePart: Part = {
    inlineData: {
      mimeType: mimeType, // e.g., 'image/jpeg', 'image/png'
      data: base64ImageData,
    },
  };
  const textPart: Part = {
    text: "Extract all visible text from this image. The text might be in English or Persian. Prioritize accuracy and return only the extracted text.",
  };

  try {
    const response: GenerateContentResponse = await ai.models.generateContent({
      model: GEMINI_MODEL_VISION, // Use a model that supports vision
      contents: { parts: [imagePart, textPart] },
    });
    if (signal?.aborted) {
      throw new DOMException('Operation aborted by user post-API call', 'AbortError');
    }
    return response.text.trim();
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    console.error("Error extracting text from image via Gemini:", error);
    throw new Error(`Gemini API error during image text extraction: ${error instanceof Error ? error.message : String(error)}`);
  }
}


export async function extractFestivalInfoFromTextViaGemini(text: string, fileName: string, signal?: AbortSignal): Promise<ExtractedData> {
  if (!ai) {
     throw new Error(GEMINI_CLIENT_INIT_ERROR_MESSAGE);
  }
   if (signal?.aborted) {
    throw new DOMException('Operation aborted by user', 'AbortError');
  }

  const prompt = `
You are an expert system for extracting information from photography contest announcements.
The following text was extracted from a contest announcement file named "${escapeStringForTemplateLiteral(fileName)}".
The text might be in English, Persian, or a mix.

Please extract the following information and provide it in a valid JSON object format.
If a field is not found, use null or an empty array/string as appropriate for the field type.

Fields to extract:
- festivalName: string (The official name of the festival or contest. If sourced from English, translate to Persian.)
- objectives: string (The objectives or goals of the festival. **Prioritize clear statements directly from the provided text for this field.** If not found in the text or if the text is ambiguous, use web search to find or clarify. If sourced from English, translate to Persian. If ultimately not found, provide null or empty string.)
- topicsString: string (A single string containing all themes, categories, or sections, separated by commas. e.g., "Nature, Portrait, Street Photography". **Prioritize clear statements directly from the provided text for this field.** If not found in the text or if the text is ambiguous, use web search to find or clarify. If sourced from English, translate to Persian. If ultimately not found, provide an empty string.)
- maxPhotos: string | number (Maximum number of photos a participant can submit. e.g., 5, "up to 10", "Unlimited". If a number, provide as number, otherwise string.)
- submissionDeadlinePersian: string (The submission deadline in YYYY/MM/DD Persian/Jalali format. Prioritize this if the source text explicitly states a Persian/Jalali deadline, e.g., 'آخرین مهلت ... شمسی'.)
- submissionDeadlineGregorian: string (The submission deadline in YYYY-MM-DD Gregorian format. Provide this if found, or if it can be clearly inferred, especially if no Persian date is explicitly stated.)
- imageSize: string (Required image dimensions, resolution, or file size. e.g., "Minimum 3000px on the long edge", "300 DPI", "Max 5MB". If sourced from English, translate to Persian.)
- submissionMethod: string (روش ارسال. بسیار مهم: اگر ارسال از طریق یک وب‌سایت است، فقط URL کامل و مستقیم آن را ارائه دهید (مثال: "https://example.com/submit"). اگر آدرس ایمیل است، فقط خود ایمیل را ارائه دهید (مثال: "contest@example.com"). برای سایر روش‌ها مانند نام یک پلتفرم، پیام‌رسان یا دستورالعمل‌های خاص که شامل لینک مستقیم یا ایمیل نیستند، توضیحی مختصر ارائه دهید (مثال: "از طریق پیام‌رسان تلگرام به آیدی @username"، "از طریق پلتفرم FilmFreeway"، "ارسال پرینت فیزیکی به آدرس X"). در صورت ارائه URL یا ایمیل، از افزودن پیشوندهای توصیفی مانند "ارسال از طریق" یا "ایمیل به" خودداری کنید.)
- feeStatusFree: boolean (Set to true if participation is explicitly stated as free or no fee is mentioned. Otherwise, false.)
- feeStatusPaid: boolean (Set to true if any participation fee is mentioned. Otherwise, false.)
- feeDescription: string | null (A textual description of the fee. Examples: "رایگان", "20 USD per entry", "First entry free, $10 for subsequent entries". If no fee information is found, use null. If it's free, you can put "رایگان" or a similar Persian phrase here. If it's paid, include the amount and currency, and any conditions. If it's mixed, describe the mixed conditions.)

Here is the text:
---
${escapeStringForTemplateLiteral(text)}
---

**Guidance for "objectives", "topicsString", and Fee Information:**
For 'objectives', 'topicsString', 'feeStatusFree', 'feeStatusPaid', and 'feeDescription', pay special attention to the text provided above. If these are clearly stated in the uploaded document's text, those statements should be the primary source. Use web search to supplement or clarify these fields *only if* the provided text is missing this information or is highly ambiguous. For fee information, if the text clearly states "free" or "رایگان", set \`feeStatusFree: true\` and \`feeStatusPaid: false\`, with \`feeDescription\` reflecting "رایگان". If a fee is mentioned (e.g., "$20", "10 EUR per image"), set \`feeStatusPaid: true\` and detail it in \`feeDescription\`. If it's a mixed scenario (e.g., "1 photo free, then $5 each"), set both \`feeStatusFree: true\` and \`feeStatusPaid: true\`, and describe in \`feeDescription\`. If no fee info is found, set both booleans to false and \`feeDescription\` to null.

**VERY IMPORTANT INSTRUCTION FOR USING WEB SEARCH:**
If the extracted text (especially for fields *other than* 'objectives' and 'topicsString' if they were clear in the document) appears incomplete OR if key information (especially \`submissionDeadlinePersian\`, \`submissionDeadlineGregorian\`, or fee details) seems missing, incorrect, or ambiguous, AND you identify a website URL (e.g., from \`submissionMethod\` or elsewhere in the text that seems to be the official contest site), **you MUST use your search capabilities to visit that website.**
Your goal is to find the most accurate and current information for all fields.

**For submission deadlines and fee information found via web search:** If the website provides clear deadlines or fee details, **that website information should be prioritized and used in the JSON output, even if different information was found in the initial text, especially if the website seems more authoritative or up-to-date.** Ensure the dates are in the specified YYYY/MM/DD (Persian) or YYYY-MM-DD (Gregorian) format.

Prioritize information directly from the provided text for other fields if it's clear and complete, but use the website to supplement or correct where necessary. **However, for 'objectives' and 'topicsString', remember to give strong preference to the uploaded document's content if it's clear.**

If you use external web sources to supplement missing or unclear information for 'festivalName', 'objectives', 'topicsString', 'imageSize', or fee details, please ensure that:
1. The information is accurately reflected from those sources.
2. If the supplemented information for 'festivalName', 'objectives', 'topicsString', 'imageSize', or 'feeDescription' is sourced from English text, provide the final value for these fields in Persian in the JSON output. Deadlines ('submissionDeadlinePersian', 'submissionDeadlineGregorian') and 'submissionMethod' should remain in their original format/language as extracted or specified by the website.

Provide ONLY the JSON object as your response. Ensure the JSON is well-formed and all strings are properly quoted.
Example JSON output:
{
  "festivalName": "مسابقه عکاسی زیبایی طبیعت",
  "objectives": "ترویج آگاهی زیست محیطی از طریق عکاسی.",
  "topicsString": "مناظر, حیات وحش",
  "maxPhotos": 10,
  "submissionDeadlinePersian": "1403/10/11",
  "submissionDeadlineGregorian": "2024-12-31",
  "imageSize": "عرض 2000 پیکسل، 72 DPI، حداکثر 4 مگابایت",
  "submissionMethod": "https://site.com/contest-entry",
  "feeStatusFree": false,
  "feeStatusPaid": true,
  "feeDescription": "هزینه ورودی: ۲۰ دلار برای هر شرکت کننده"
}
`;
  let apiResponseText: string | undefined;
  let response: GenerateContentResponse;

  try {
    response = await ai.models.generateContent({
        model: GEMINI_MODEL_TEXT,
        contents: prompt,
        config: {
            tools: [{googleSearch: {}}],
        }
    });

    if (signal?.aborted) {
      throw new DOMException('Operation aborted by user post-API call', 'AbortError');
    }

    apiResponseText = response.text;
    const jsonString = cleanJsonString(apiResponseText);

    const rawParsedData = JSON.parse(jsonString) as any;

    let extractionSourceUrls: { uri: string; title: string }[] = [];
    if (response.candidates && response.candidates[0]?.groundingMetadata?.groundingChunks) {
      extractionSourceUrls = response.candidates[0].groundingMetadata.groundingChunks
        .filter((chunk: GroundingChunk) => chunk.web && chunk.web.uri)
        .map((chunk: GroundingChunk) => ({
          uri: chunk.web!.uri!,
          title: chunk.web!.title || chunk.web!.uri!,
        }));
      extractionSourceUrls = Array.from(new Map(extractionSourceUrls.map(item => [item.uri, item])).values());
    }

    const parsedData: ExtractedData = {
        festivalName: rawParsedData.festivalName,
        objectives: rawParsedData.objectives,
        topics: [],
        maxPhotos: typeof rawParsedData.maxPhotos === 'string'
            ? convertPersianToWesternNumerals(rawParsedData.maxPhotos)
            : rawParsedData.maxPhotos,
        submissionDeadlineGregorian: convertPersianToWesternNumerals(rawParsedData.submissionDeadlineGregorian),
        submissionDeadlinePersian: convertPersianToWesternNumerals(rawParsedData.submissionDeadlinePersian),
        imageSize: rawParsedData.imageSize,
        submissionMethod: rawParsedData.submissionMethod ? normalizeSubmissionUrl(rawParsedData.submissionMethod) : undefined,
        feeStatusFree: typeof rawParsedData.feeStatusFree === 'boolean' ? rawParsedData.feeStatusFree : false,
        feeStatusPaid: typeof rawParsedData.feeStatusPaid === 'boolean' ? rawParsedData.feeStatusPaid : false,
        feeDescription: rawParsedData.feeDescription === null ? null : String(rawParsedData.feeDescription || ''),
        extractionSourceUrls: extractionSourceUrls.length > 0 ? extractionSourceUrls : undefined,
    };

    if (rawParsedData.topicsString && typeof rawParsedData.topicsString === 'string' && rawParsedData.topicsString.trim() !== "") {
        parsedData.topics = rawParsedData.topicsString.split(',').map((t:string) => t.trim()).filter((t:string) => t);
    }

    if (parsedData.maxPhotos && typeof parsedData.maxPhotos === 'string' && /^\d+$/.test(parsedData.maxPhotos)) {
        parsedData.maxPhotos = parseInt(parsedData.maxPhotos, 10);
    }
    
    // Ensure feeDescription is null if both statuses are false and description is empty or "null"
    if (parsedData.feeStatusFree === false && parsedData.feeStatusPaid === false && (!parsedData.feeDescription || parsedData.feeDescription.toLowerCase() === 'null')) {
        parsedData.feeDescription = null;
    }
    // If free is true, and paid is false, ensure description makes sense or is nulled
    if (parsedData.feeStatusFree === true && parsedData.feeStatusPaid === false && parsedData.feeDescription === '') {
        parsedData.feeDescription = "رایگان";
    }


    return parsedData;

  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    console.error("Error extracting festival info via Gemini:", error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (errorMessage.includes("quota") || errorMessage.includes("API key")) {
         throw new Error(`Gemini API error: ${errorMessage}. Please check your API key and usage quota.`);
    }
    if (error instanceof SyntaxError && apiResponseText) {
      throw new Error(`Gemini API error during information extraction: ${errorMessage}. Problematic JSON string: ${cleanJsonString(apiResponseText)}`);
    }
    if (typeof error === 'object' && error !== null && 'message' in error && typeof (error as any).message === 'string') {
       const geminiMessage = (error as any).message;
       if (geminiMessage.includes("INVALID_ARGUMENT") || geminiMessage.includes("Tool use with a response mime type")){
         throw new Error(`Gemini API configuration error: ${geminiMessage}`);
       }
    }
    throw new Error(`Gemini API error during information extraction: ${errorMessage}`);
  }
}


export async function getSmartFestivalAnalysisViaGemini(
  festivalName: string | undefined,
  topics: string[] | undefined,
  objectives: string | undefined,
  userNotesForSmartAnalysis?: string,
  signal?: AbortSignal
): Promise<{ analysisText: string; sourceUrls: { uri: string; title: string }[] }> {
  if (!ai) {
    throw new Error(GEMINI_CLIENT_INIT_ERROR_MESSAGE);
  }
  if (!festivalName) throw new Error("Festival name is required for smart analysis.");
  if (signal?.aborted) {
    throw new DOMException('Operation aborted by user', 'AbortError');
  }

  const topicsString = topics && topics.length > 0 ? topics.join(', ') : 'نامشخص';
  const objectivesString = objectives || 'نامشخص';

  let userNotesSection = '';
  if (userNotesForSmartAnalysis && userNotesForSmartAnalysis.trim() !== '') {
    userNotesSection = `
**User-provided supplementary notes to aid analysis:**
--- START OF USER NOTES ---
${escapeStringForTemplateLiteral(userNotesForSmartAnalysis.trim())}
--- END OF USER NOTES ---
Please use these notes to supplement your understanding of the festival and provide a more accurate analysis.
`;
  }

  const prompt = `You are an expert analyst for photography competitions. For a festival named "**${escapeStringForTemplateLiteral(festivalName)}**" with the following details:
- Topics/Categories: ${escapeStringForTemplateLiteral(topicsString)}
- Objectives: ${escapeStringForTemplateLiteral(objectivesString)}
${userNotesSection}

Your task is to provide a comprehensive and deep analysis to determine which types of photos are most likely to succeed.
**You MUST use Google Search** to find information about:
1.  **Past Editions of "${escapeStringForTemplateLiteral(festivalName)}"**: Look for past winners, recurring themes, successful styles (e.g., documentary, portrait, conceptual, fine art), and the overall aesthetic. The text you generate should include numbered citations (e.g., [1], [2]) for facts sourced from the web.
2.  **Jury Members**: Find the jury for the current or recent editions. Analyze their personal work, interviews, and stated judging criteria to infer their preferences. **Analyze their group dynamics as well.**

**Response Instructions:**
You **MUST** provide a well-structured **JSON object** in PERSIAN. The JSON object should contain the following keys. Do not include any text outside of the JSON object. Your analysis within the JSON values must cite sources using numbered brackets (e.g., [1], [2]) corresponding to the information you find.

- "comprehensiveAnalysis": (string) Your findings from researching past editions of the festival. Mention thematic patterns, successful styles, conceptual depth, and the general atmosphere of winning works. State if no history was found.
- "trendAnalysis": (string) Analyze the festival's evolution. Have themes or winning styles changed in the last three editions? Is the festival moving towards more conceptual, minimalist, or documentary photos? Describe the trend.
- "judgesAnalysis": (string) Your findings about the jury. Describe their work styles, professional backgrounds, and potential artistic preferences. Analyze their group dynamics. State explicitly if no information on judges was found.
- "suggestedGenres": (string) Based on all analysis, explain which genres and styles have a higher chance of success. Justify each suggestion. Use '*' for list items within the string.
- "keyConcepts": (string) Provide several specific, creative, and actionable photography ideas and concepts that align with your analysis. Use '*' for list items within the string.
- "technicalNotes": (string) If inferable from your analysis, mention any specific technical aspects that might be favored.
- "commonMistakes": (string) Based on the festival's identity, point out common mistakes or misinterpretations that participants should avoid.
- "finalRecommendations": (string) A brief summary of your most important findings and key recommendations.

**General Quality Instruction:**
Provide your analyses in a comprehensive and in-depth manner. Avoid overly short and superficial answers. The writing style should be professional, clear, and direct. The entire JSON response should be in Persian.
`;

  try {
    const response: GenerateContentResponse = await ai.models.generateContent({
      model: GEMINI_MODEL_TEXT,
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }],
      },
    });
    if (signal?.aborted) {
      throw new DOMException('Operation aborted by user post-API call', 'AbortError');
    }

    const analysisText = cleanJsonString(response.text.trim());
    
    // Validate if it's JSON before returning.
    try {
        JSON.parse(analysisText);
    } catch(e) {
        console.error("Gemini returned non-JSON for smart analysis, even when prompted for it.", analysisText);
        throw new Error("پاسخ تحلیل هوشمند فرمت JSON معتبری نداشت.");
    }

    let sourceUrls: { uri: string; title: string }[] = [];

    if (response.candidates && response.candidates[0]?.groundingMetadata?.groundingChunks) {
      sourceUrls = response.candidates[0].groundingMetadata.groundingChunks
        .filter((chunk: GroundingChunk) => chunk.web && chunk.web.uri)
        .map((chunk: GroundingChunk) => ({
          uri: chunk.web!.uri!,
          title: chunk.web!.title || chunk.web!.uri!,
        }));
    }

    const uniqueSourceUrls = Array.from(new Map(sourceUrls.map(item => [item.uri, item])).values());

    return { analysisText, sourceUrls: uniqueSourceUrls };

  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    
    const errorMessage = error instanceof Error ? error.message : String(error);

    console.error("Error getting smart festival analysis via Gemini:", error);
    throw new Error(`Gemini API error during smart analysis: ${errorMessage}`);
  }
}


interface ImageAnalysisPayload {
  imageCritique: string;
  suitabilityScoreOutOf10: number;
  scoreReasoning: string;
  editingCritiqueAndSuggestions?: string | null;
}

interface FestivalContextForImageAnalysis {
    festivalName?: string;
    topics?: string[];
    objectives?: string;
    smartAnalysisText: string;
    focusedTopic?: string;
    userImageDescription?: string;
}

export async function analyzeImageForFestivalViaGemini(
  base64ImageData: string,
  mimeType: string,
  festivalInfo: FestivalContextForImageAnalysis,
  signal?: AbortSignal
): Promise<ImageAnalysisPayload> {
  if (!ai) {
    throw new Error(GEMINI_CLIENT_INIT_ERROR_MESSAGE);
  }
  if (!festivalInfo.smartAnalysisText) throw new Error("Smart festival analysis text is required to analyze the image.");
  if (signal?.aborted) {
    throw new DOMException('Operation aborted by user', 'AbortError');
  }

  const imagePart: Part = {
    inlineData: {
      mimeType: mimeType,
      data: base64ImageData,
    },
  };

  const prompt = `
You are a highly discerning photo contest judge. You have already been provided with a detailed "Smart Festival Analysis" for a specific contest.
Your task is to evaluate the_CURRENT_IMAGE_ (provided as inline data) **strictly based on how well it aligns with that prior "Smart Festival Analysis" AND any specific topic focus mentioned below.**

**Context: Festival Information**
- Festival Name: ${escapeStringForTemplateLiteral(festivalInfo.festivalName || 'N/A')}
- Festival Topics (Overall): ${escapeStringForTemplateLiteral(festivalInfo.topics?.join(', ') || 'N/A')}
- Festival Objectives: ${escapeStringForTemplateLiteral(festivalInfo.objectives || 'N/A')}

**This is the "Smart Festival Analysis" you must use as your primary reference for judging the_CURRENT_IMAGE_:**
--- START OF SMART FESTIVAL ANALYSIS ---
${escapeStringForTemplateLiteral(festivalInfo.smartAnalysisText)}
--- END OF SMART FESTIVAL ANALYSIS ---

${ festivalInfo.focusedTopic && festivalInfo.focusedTopic !== GENERAL_ANALYSIS_TOPIC_VALUE ? `
**Specific Focus for this Analysis:**
In addition to the overall "Smart Festival Analysis", pay PARTICULAR ATTENTION to how the_CURRENT_IMAGE_ specifically relates to the following festival topic/theme that the user has selected:
- **Selected Topic Focus: ${escapeStringForTemplateLiteral(festivalInfo.focusedTopic)}**

Your critique and score should heavily weigh the image's relevance and execution concerning this **Selected Topic Focus**, while still considering the broader festival analysis. If the image does not align well with the Selected Topic Focus, this should negatively impact the score, even if it's a good image generally.
` : '' }

${festivalInfo.userImageDescription ? `
**User's Description for the_CURRENT_IMAGE_ (توضیحات کاربر برای تصویر فعلی):**
The photographer has provided the following optional description for this image:
"${escapeStringForTemplateLiteral(festivalInfo.userImageDescription)}"
Consider this description as potential context or intent behind the photo. It might reveal aspects or connections to the festival's theme, the Smart Analysis, or the Selected Topic Focus (if applicable) that are not immediately apparent from the visual content alone. However, if the image, even with this description, remains clearly misaligned with the festival's core criteria, the description should not override an objective assessment of its suitability. Thematic relevance (as outlined below) remains paramount.
` : ''}

**Your Task for the_CURRENT_IMAGE_:**

**CRITICAL SCORING AND CRITIQUE PRIORITIZATION (بسیار مهم - اولویت‌بندی نقد و نمره):**
The **MOST IMPORTANT FACTOR (مهم‌ترین عامل)** in your critique and score is the_CURRENT_IMAGE_'s **direct relevance and alignment (ارتباط و هم‌سویی مستقیم)** with:
1.  The **festival's core identity (هویت اصلی جشنواره)**: Name (\`${escapeStringForTemplateLiteral(festivalInfo.festivalName || 'N/A')}\`), stated Objectives (\`${escapeStringForTemplateLiteral(festivalInfo.objectives || 'N/A')}\`), and overall Topics (\`${escapeStringForTemplateLiteral(festivalInfo.topics?.join(', ') || 'N/A')}\`).
2.  The insights provided in the **"Smart Festival Analysis" (تحلیل هوشمند جشنواره ارائه‌شده)**.
3.  ${festivalInfo.focusedTopic && festivalInfo.focusedTopic !== GENERAL_ANALYSIS_TOPIC_VALUE ? `And **MOST CRITICALLY (و مهم‌تر از همه)**, its alignment with the **Selected Topic Focus: ${escapeStringForTemplateLiteral(festivalInfo.focusedTopic)} (موضوع انتخابی کاربر برای تحلیل: ${escapeStringForTemplateLiteral(festivalInfo.focusedTopic)})**.` : `(No specific sub-topic was selected for this image; evaluate against the overall festival criteria - برای این عکس موضوع خاصی انتخاب نشده، بر اساس معیارهای کلی جشنواره ارزیابی کنید.)`}

**A technically flawless image (یک عکس بی‌نقص از نظر فنی) (perfect composition, lighting, editing - ترکیب‌بندی، نورپردازی، ویرایش عالی) that is NOT relevant to the festival's theme/objectives (که با موضوع/اهداف جشنواره مرتبط نیست) (and selected topic focus, if provided - و موضوع انتخابی کاربر، در صورت وجود) MUST receive a LOW score (e.g., 0-3) (باید نمره پایینی بگیرد، مثلا ۰ تا ۳).**
A relevant image with some technical imperfections might still score higher than an irrelevant but technically perfect one. (یک عکس مرتبط با جشنواره اما با ایرادات فنی جزئی، ممکن است نمره بالاتری از یک عکس بی‌ربط اما بی‌نقص فنی بگیرد).

Your critique should first address thematic relevance (نقد شما ابتدا باید به ارتباط موضوعی بپردازد), then discuss conceptual strength, emotional impact, narrative quality (where applicable), and finally technical aspects (composition, aesthetics, editing - سپس جنبه‌های فنی مانند ترکیب‌بندی، زیبایی‌شناسی، ویرایش) in the context of how they serve (or fail to serve) the theme and the festival's likely expectations based on the Smart Analysis (و توضیح دهد که چگونه این جنبه‌های فنی در خدمت موضوع و انتظارات جشنواره (طبق تحلیل هوشمند) هستند یا نیستند).

1.  **Critique the Image (نقد تصویر)**: Provide a concise critique (in Persian - به فارسی) explaining how well the_CURRENT_IMAGE_ aligns with the specific suggestions, themes, styles, technical considerations, and overall guidance mentioned in the "Smart Festival Analysis" above. Address its conceptual strength, emotional impact, and narrative quality (if applicable) in this context. ${festivalInfo.focusedTopic && festivalInfo.focusedTopic !== GENERAL_ANALYSIS_TOPIC_VALUE ? "Crucially, emphasize its alignment (or lack thereof) with the **Selected Topic Focus: " + escapeStringForTemplateLiteral(festivalInfo.focusedTopic) + "**." : ""} Highlight strengths and weaknesses *in relation to that analysis (and selected topic if applicable)*. If the user provided a description, briefly acknowledge how it was considered in your critique.
2.  **Score the Image (نمره تصویر)**: Give a numerical score from 0 to 10 (0 = Not at all suitable, 10 = Perfectly suitable - ۰ = اصلا مناسب نیست، ۱۰ = کاملا مناسب است) indicating the image's potential for success in *this specific festival*, based *only* on its alignment with the "Smart Festival Analysis" ${festivalInfo.focusedTopic && festivalInfo.focusedTopic !== GENERAL_ANALYSIS_TOPIC_VALUE ? "and particularly its relevance to the **Selected Topic Focus: " + escapeStringForTemplateLiteral(festivalInfo.focusedTopic) + "**" : ""}.
3.  **Reasoning for Score (دلیل نمره)**: Briefly explain (in Persian - به فارسی) the primary reasons for your score, directly linking it to aspects of the "Smart Festival Analysis" ${festivalInfo.focusedTopic && festivalInfo.focusedTopic !== GENERAL_ANALYSIS_TOPIC_VALUE ? "and the **Selected Topic Focus: " + escapeStringForTemplateLiteral(festivalInfo.focusedTopic) + "**" : ""}.
4.  **Editing Critique and Suggestions (نقد و پیشنهادات ویرایش)**: This part is conditional. **If, AND ONLY IF, your \`suitabilityScoreOutOf10\` for the_CURRENT_IMAGE_ is 7 or higher**, provide detailed feedback on the image's editing (in Persian). This section should include:
    a.  **نقد ویرایش فعلی عکس (Critique of current editing):** Discuss aspects like color balance, contrast, sharpness, noise reduction, cropping, and any specific techniques used, evaluating their effectiveness and appropriateness for the image and festival context as per the "Smart Festival Analysis".
    b.  **پیشنهادات دقیق برای بهتر شدن ویرایش (Specific suggestions for improving the edit):** Offer actionable, detailed, and structured advice on how the editing could be enhanced to better serve the image's message and align it more closely with the festival's themes (as per the Smart Analysis and selected topic). This should cover (where applicable):
        *   **تنظیمات کلی (Global Adjustments):** مانند نوردهی کلی، کنتراست، تعادل رنگ، وایت بالانس، وضوح کلی.
        *   **تنظیمات موضعی (Local Adjustments):** مانند تکنیک‌های داج و برن برای هدایت چشم یا تاکید بر سوژه، شارپ کردن انتخابی، اصلاحات رنگی یا نوری در بخش‌های خاص تصویر.
        *   **ترکیب‌بندی (Compositional Adjustments):** پیشنهاداتی برای کراپ بهتر (اگر لازم است)، اصلاح پرسپکتیو، یا حذف عناصر پرت‌کننده از طریق ویرایش.
        *   **رنگ و تونالیته (Color and Tonality):** پیشنهاداتی برای بهبود گرادینگ رنگ، تبدیل به سیاه‌وسفید (در صورت تناسب)، یا ایجاد اتمسفر خاص از طریق رنگ.
        *   **تکنیک‌های پیشرفته‌تر (Advanced Techniques) (در صورت تناسب با عکس و جشنواره):** مانند اصلاحات خلاقانه و هنری رنگ، استفاده از فیلترهای دیجیتال خاص، یا تکنیک‌های خاص دیگر که به ارتقای تصویر کمک کند.
        *   **مواردی که در ویرایش باید از آن‌ها اجتناب کرد (Things to avoid in editing for this specific image/festival):** بر اساس ماهیت جشنواره و عکس، به مواردی اشاره کنید که ویرایش بیش از حد یا نامناسب آن‌ها می‌تواند به ضرر عکس تمام شود (مثلاً اغراق در رنگ‌ها در یک جشنواره مستند).
    If the score is below 7, this field (\`editingCritiqueAndSuggestions\`) should be \`null\` or an empty string.

**Output Format (فرمت خروجی):**
Return your response as a **single, valid JSON object (یک شیء JSON واحد و معتبر)** with the following keys:
- \`imageCritique\`: string (Your detailed critique in Persian - نقد دقیق شما به فارسی)
- \`suitabilityScoreOutOf10\`: number (Your score from 0 to 10 - نمره شما از ۰ تا ۱۰)
- \`scoreReasoning\`: string (Your brief reasoning for the score in Persian - توضیح مختصر شما برای نمره به فارسی)
- \`editingCritiqueAndSuggestions\`: string | null (Detailed editing feedback in Persian if score >= 7, otherwise null or empty string - نقد و پیشنهادات ویرایش به فارسی اگر نمره ۷ یا بالاتر باشد، در غیر این صورت null یا رشته خالی)

**Example JSON output (نمونه خروجی JSON):**
\`\`\`json
{
  "imageCritique": "این تصویر به خوبی با بخش «عکاسی مفهومی با تاکید بر مینیمالیسم» که در تحلیل جشنواره ذکر شده، هم‌خوانی دارد. استفاده از فضای منفی هوشمندانه است. با این حال، برای تطابق بیشتر با توصیه «استفاده از رنگ‌های مونوکروم یا پالت محدود» در تحلیل، بهتر بود از رنگ‌های کمتری استفاده می‌شد. اگرچه عکس از نظر فنی خوب است، اما ارتباط مستقیمی با موضوع اصلی جشنواره یعنی 'شادی در حرکت' ندارد. توضیحات کاربر مبنی بر اینکه 'این عکس تلاش دارد سکون قبل از حرکت را نشان دهد' در نظر گرفته شد، اما ارتباط بصری با 'شادی در حرکت' همچنان ضعیف است.",
  "suitabilityScoreOutOf10": 4,
  "scoreReasoning": "هم‌سویی خوب با برخی جنبه‌های تحلیل هوشمند (مفهومی و مینیمالیسم)، اما عدم ارتباط قوی با موضوع اصلی جشنواره ('شادی در حرکت') نمره را کاهش داده است. توضیحات کاربر به درک بهتر نیت کمک کرد اما نتوانست ضعف ارتباط بصری را جبران کند. جنبه‌های فنی قابل قبول هستند اما در خدمت موضوع اصلی نیستند.",
  "editingCritiqueAndSuggestions": null
}
\`\`\`
\`\`\`json
{
  "imageCritique": "این تصویر به شکلی عالی با تحلیل هوشمند جشنواره و موضوع انتخابی 'زندگی شهری در شب' همسو است. نوردهی طولانی به خوبی حرکت و پویایی شهر را به تصویر کشیده و ترکیب‌بندی با استفاده از خطوط هدایتگر، چشم را به سمت مرکز تصویر هدایت می‌کند. قدرت مفهومی آن در نمایش گذر زمان و انرژی شهری بالاست.",
  "suitabilityScoreOutOf10": 8,
  "scoreReasoning": "ارتباط موضوعی بسیار قوی با تمرکز انتخابی و تحلیل کلی. تکنیک عکاسی به خوبی در خدمت مفهوم بوده و اجرای فنی قابل قبول است. عکس تاثیر احساسی خوبی در انتقال حس شب مدرن دارد.",
  "editingCritiqueAndSuggestions": "نقد ویرایش فعلی عکس: ویرایش فعلی از نظر نور و رنگ مناسب است و جزئیات در سایه‌ها و هایلایت‌ها حفظ شده‌اند. کنتراست کلی خوب است و به خوانایی تصویر کمک کرده.\\nپیشنهادات دقیق برای بهتر شدن ویرایش: \\n* تنظیمات کلی: می‌توانید برای تاکید بیشتر بر فضای شب، کمی (بسیار نامحسوس) وایت بالانس را به سمت رنگ‌های سردتر متمایل کنید.\\n* تنظیمات موضعی: خطوط نورانی ماشین‌ها را می‌توان با کمی افزایش selective saturation جذاب‌تر کرد. همچنین، برای ایجاد عمق بیشتر، ساختمان‌های دورتر را با داج کردن جزئی، کمی محوتر نمایش دهید.\\n* ترکیب‌بندی: کراپ فعلی مناسب به نظر می‌رسد.\\n* رنگ و تونالیته: اگر قصد ایجاد اتمسفری سینمایی‌تر دارید، می‌توانید از گرادینت رنگی ملایمی (مثلاً ترکیب آبی تیره و نارنجی) در آسمان و بازتاب نورها استفاده کنید.\\n* مواردی که در ویرایش باید از آن‌ها اجتناب کرد: از شارپ کردن بیش از حد که باعث ایجاد هاله دور لبه‌ها شود، پرهیز کنید. همچنین، افزایش بیش از حد کنتراست در مناطق روشن می‌تواند باعث از دست رفتن جزئیات شود."
}
\`\`\`

**Important (نکات مهم):**
- Your entire response must be in Persian (کل پاسخ شما باید به فارسی باشد).
- The JSON must be perfectly valid (JSON باید کاملا معتبر باشد).
- Do not include any text outside the JSON object (هیچ متنی خارج از شیء JSON قرار ندهید).
- Focus *exclusively* on comparing the_CURRENT_IMAGE_ to the provided "Smart Festival Analysis" (and "Selected Topic Focus" and "User's Description" if applicable). Do not introduce external judging criteria (تمرکز شما منحصراً بر مقایسه تصویر فعلی با «تحلیل هوشمند جشنواره» (و «موضوع انتخابی کاربر» و «توضیحات کاربر» در صورت وجود) باشد. از معیارهای داوری خارجی استفاده نکنید).
`;

  let geminiApiResponse: GenerateContentResponse | undefined;

  try {
    geminiApiResponse = await ai.models.generateContent({
      model: GEMINI_MODEL_VISION,
      contents: { parts: [imagePart, { text: prompt }] },
      config: {
        responseMimeType: "application/json",
      },
    });
    if (signal?.aborted) {
      throw new DOMException('Operation aborted by user post-API call', 'AbortError');
    }

    const jsonString = cleanJsonString(geminiApiResponse.text);
    const parsedData = JSON.parse(jsonString) as ImageAnalysisPayload;

    if (typeof parsedData.suitabilityScoreOutOf10 !== 'number' || parsedData.suitabilityScoreOutOf10 < 0 || parsedData.suitabilityScoreOutOf10 > 10) {
        console.warn("Gemini returned an invalid score, defaulting to 0. Raw score:", parsedData.suitabilityScoreOutOf10);
        parsedData.suitabilityScoreOutOf10 = 0;
    }

    if (parsedData.suitabilityScoreOutOf10 < 7) {
        parsedData.editingCritiqueAndSuggestions = null;
    } else if (parsedData.editingCritiqueAndSuggestions === "") {
        parsedData.editingCritiqueAndSuggestions = null;
    }

    return parsedData;

  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    console.error("Error analyzing image for festival via Gemini:", error);
    const errorMessage = error instanceof Error ? error.message : String(error);
     if (error instanceof SyntaxError) {
      const responseText = geminiApiResponse ? geminiApiResponse.text : "Response text not available (error likely occurred before Gemini response was received or response was undefined).";
      throw new Error(`Gemini API error: Failed to parse JSON response for image analysis. ${errorMessage}. Response text: ${cleanJsonString(responseText)}`);
    }
    throw new Error(`Gemini API error during image analysis for festival: ${errorMessage}`);
  }
}