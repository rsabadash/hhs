export async function imageData(file: File): Promise<string> {
  if (
    file.size > 3 * 1024 * 1024 ||
    !['image/jpeg', 'image/png', 'image/webp'].includes(file.type)
  )
    throw Error('Оберіть JPEG, PNG або WebP до 3 МБ.');
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(Error('Не вдалося прочитати файл.'));
    reader.readAsDataURL(file);
  });
}
