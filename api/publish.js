import { put } from '@vercel/blob';

// این تنظیمات برای ارسال مستقیم بدنه درخواست به سرویس Blob ضروری است
export const config = {
  api: {
    bodyParser: false,
  },
};

// تابع اصلی که درخواست‌ها را مدیریت می‌کند
export default async function handler(request, response) {
  // اطمینان از اینکه متد درخواست POST است
  if (request.method !== 'POST') {
    return response.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    // The `put` function relies on the `BLOB_READ_WRITE_TOKEN` environment variable.
    // This variable is automatically configured when you integrate your project with Vercel Blob.
    // If it's missing, the function will fail. We add an explicit check for a better error message.
    if (!process.env.BLOB_READ_WRITE_TOKEN) {
      throw new Error("Server configuration error: The BLOB_READ_WRITE_TOKEN environment variable is missing. Please integrate your project with Vercel Blob from the Vercel dashboard.");
    }
      
    // استفاده از دستور put برای ذخیره کردن محتوای درخواست در فایلی به نام 'updates.json'
    const blob = await put(
      'updates.json', // نام فایل در فضای ابری
      request,        // ارسال مستقیم کل بدنه درخواست
      {
        access: 'public', // فایل باید عمومی و قابل دسترس باشد
        contentType: 'application/json', // نوع محتوای فایل
        allowOverwrite: true, // IMPORTANT: Allow overwriting the existing file
      }
    );

    // ارسال پاسخ موفقیت‌آمیز به همراه اطلاعات فایل ذخیره شده
    return response.status(200).json(blob);

  } catch (error) {
    // در صورت بروز خطا، آن را در لاگ سرور ثبت کرده و پیام خطا برمی‌گردانیم
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
    console.error('An error occurred during blob upload:', error);
    
    // Return a more detailed error to the client for better debugging
    return response.status(500).json({ 
        error: 'خطای داخلی سرور هنگام انتشار فایل رخ داد.',
        details: errorMessage
    });
  }
}