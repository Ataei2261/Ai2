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
    // استفاده از دستور put برای ذخیره کردن محتوای درخواست در فایلی به نام 'updates.json'
    const blob = await put(
      'updates.json', // نام فایل در فضای ابری
      request,        // ارسال مستقیم کل بدنه درخواست
      {
        access: 'public', // فایل باید عمومی و قابل دسترس باشد
        contentType: 'application/json', // نوع محتوای فایل
      }
    );

    // ارسال پاسخ موفقیت‌آمیز به همراه اطلاعات فایل ذخیره شده
    return response.status(200).json(blob);

  } catch (error) {
    // در صورت بروز خطا، آن را در لاگ سرور ثبت کرده و پیام خطا برمی‌گردانیم
    console.error('An error occurred during blob upload:', error);
    return response.status(500).json({ error: 'An error occurred while publishing the file.' });
  }
}