const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const sharp = require('sharp');

const app = express();
const PORT = process.env.PORT || 3000;

// Parse URL-encoded bodies for edit form
app.use(express.urlencoded({ extended: true }));

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Use memory storage so we can process with sharp before saving
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (req, file, cb) => {
    const allowed = /jpeg|jpg|png|gif|webp|svg/;
    const ext = allowed.test(path.extname(file.originalname).toLowerCase());
    const mime = allowed.test(file.mimetype);
    if (ext && mime) {
      cb(null, true);
    } else {
      cb(new Error('Only images allowed'));
    }
  }
});

// Serve uploaded images directly at root level: /imagename.png
app.use(express.static(uploadsDir));

// Upload page
app.get('/', (req, res) => {
  // List existing images with metadata
  const images = fs.readdirSync(uploadsDir)
    .filter(f => /\.(jpg|jpeg|png|gif|webp|svg)$/i.test(f))
    .map(f => {
      const filepath = path.join(uploadsDir, f);
      const stats = fs.statSync(filepath);
      return { name: f, size: stats.size };
    });

  res.send(`
<!DOCTYPE html>
<html>
<head>
  <title>Image Hosting</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    * { box-sizing: border-box; }
    body { 
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      max-width: 900px; 
      margin: 0 auto; 
      padding: 20px;
      background: #0f0f0f;
      color: #e0e0e0;
    }
    h1 { color: #4ecdc4; margin-bottom: 30px; }
    .upload-form {
      background: #1a1a1a;
      padding: 25px;
      border-radius: 12px;
      margin-bottom: 30px;
      border: 1px solid #333;
    }
    label {
      display: block;
      margin-top: 15px;
      margin-bottom: 5px;
      color: #aaa;
      font-size: 14px;
    }
    input[type="file"], input[type="text"], input[type="number"], select {
      display: block;
      width: 100%;
      padding: 12px;
      margin: 5px 0;
      background: #2a2a2a;
      border: 1px solid #444;
      border-radius: 8px;
      color: #fff;
    }
    .row {
      display: flex;
      gap: 15px;
    }
    .row > div {
      flex: 1;
    }
    input[type="text"]::placeholder, input[type="number"]::placeholder { color: #666; }
    button, .btn {
      background: #4ecdc4;
      color: #000;
      border: none;
      padding: 10px 18px;
      border-radius: 8px;
      cursor: pointer;
      font-weight: 600;
      font-size: 14px;
      text-decoration: none;
      display: inline-block;
    }
    button:hover, .btn:hover { background: #3dbdb5; }
    .btn-small {
      padding: 6px 12px;
      font-size: 12px;
    }
    .images { margin-top: 30px; }
    .image-item {
      background: #1a1a1a;
      padding: 15px;
      margin: 10px 0;
      border-radius: 8px;
      border: 1px solid #333;
      display: flex;
      align-items: flex-start;
      gap: 15px;
    }
    .image-item img { 
      width: 120px; 
      height: 80px;
      object-fit: cover;
      border-radius: 4px;
      flex-shrink: 0;
    }
    .image-info {
      flex: 1;
      min-width: 0;
    }
    .image-info strong {
      display: block;
      margin-bottom: 8px;
      word-break: break-all;
    }
    .url-box {
      background: #2a2a2a;
      padding: 8px 12px;
      border-radius: 6px;
      font-family: monospace;
      font-size: 12px;
      color: #4ecdc4;
      display: block;
      margin: 8px 0;
      word-break: break-all;
    }
    .btn-group {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
      margin-top: 10px;
    }
    .copy-btn {
      background: #555;
    }
    .edit-btn {
      background: #5588cc;
    }
    .delete-btn {
      background: #c44;
    }
    .hint {
      color: #666;
      font-size: 12px;
      margin-top: 5px;
    }
    .size-info {
      color: #666;
      font-size: 12px;
    }
  </style>
</head>
<body>
  <h1>🖼️ Image Hosting</h1>
  
  <div class="upload-form">
    <form action="/upload" method="post" enctype="multipart/form-data">
      <label>Select Image</label>
      <input type="file" name="image" accept="image/*" required>
      
      <label>Custom Filename (optional)</label>
      <input type="text" name="customName" placeholder="my-image (without extension)">
      
      <label>Resize (optional - leave empty for original size)</label>
      <div class="row">
        <div>
          <input type="number" name="width" placeholder="Width (px)" min="1" max="4000">
        </div>
        <div>
          <input type="number" name="height" placeholder="Height (px)" min="1" max="4000">
        </div>
      </div>
      <p class="hint">Set only width or height to maintain aspect ratio</p>
      
      <label>Output Format (optional)</label>
      <select name="format">
        <option value="">Keep original</option>
        <option value="png">PNG</option>
        <option value="jpeg">JPEG</option>
        <option value="webp">WebP</option>
      </select>
      
      <button type="submit" style="margin-top:15px">Upload Image</button>
    </form>
  </div>

  <div class="images">
    <h2>Hosted Images (${images.length})</h2>
    ${images.length === 0 ? '<p style="color:#666">No images uploaded yet</p>' : ''}
    ${images.map(img => `
      <div class="image-item">
        <img src="/${img.name}?t=${Date.now()}" alt="${img.name}">
        <div class="image-info">
          <strong>${img.name}</strong>
          <span class="size-info">${(img.size / 1024).toFixed(1)} KB</span>
          <div class="url-box" id="url-${img.name}">${req.protocol}://${req.get('host')}/${img.name}</div>
          <div class="btn-group">
            <button class="btn-small copy-btn" onclick="copyUrl('${img.name}')">Copy URL</button>
            <a class="btn btn-small edit-btn" href="/edit/${encodeURIComponent(img.name)}">Edit / Resize</a>
            <button class="btn-small delete-btn" onclick="deleteImg('${img.name}')">Delete</button>
          </div>
        </div>
      </div>
    `).join('')}
  </div>

  <script>
    function copyUrl(img) {
      const url = document.getElementById('url-' + img).textContent;
      navigator.clipboard.writeText(url);
    }
    function deleteImg(img) {
      if (confirm('Delete ' + img + '?')) {
        fetch('/delete/' + encodeURIComponent(img), { method: 'DELETE' })
          .then(() => location.reload());
      }
    }
  </script>
</body>
</html>
  `);
});

// Edit page for existing image
app.get('/edit/:filename', async (req, res) => {
  const filename = req.params.filename;
  const filepath = path.join(uploadsDir, filename);
  
  if (!fs.existsSync(filepath)) {
    return res.status(404).send('Image not found');
  }

  // Get image dimensions
  let dimensions = { width: 0, height: 0 };
  try {
    const metadata = await sharp(filepath).metadata();
    dimensions = { width: metadata.width, height: metadata.height };
  } catch (e) {
    console.error('Could not read image metadata:', e);
  }

  const baseName = path.basename(filename, path.extname(filename));
  const ext = path.extname(filename).toLowerCase().replace('.', '');

  res.send(`
<!DOCTYPE html>
<html>
<head>
  <title>Edit: ${filename}</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    * { box-sizing: border-box; }
    body { 
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      max-width: 700px; 
      margin: 0 auto; 
      padding: 20px;
      background: #0f0f0f;
      color: #e0e0e0;
    }
    h1 { color: #4ecdc4; margin-bottom: 10px; font-size: 24px; }
    .back { color: #4ecdc4; text-decoration: none; display: inline-block; margin-bottom: 20px; }
    .preview {
      background: #1a1a1a;
      padding: 20px;
      border-radius: 12px;
      text-align: center;
      margin-bottom: 20px;
      border: 1px solid #333;
    }
    .preview img {
      max-width: 100%;
      max-height: 300px;
      border-radius: 8px;
    }
    .current-info {
      color: #888;
      font-size: 14px;
      margin-top: 10px;
    }
    .edit-form {
      background: #1a1a1a;
      padding: 25px;
      border-radius: 12px;
      border: 1px solid #333;
    }
    label {
      display: block;
      margin-top: 15px;
      margin-bottom: 5px;
      color: #aaa;
      font-size: 14px;
    }
    input[type="text"], input[type="number"], select {
      display: block;
      width: 100%;
      padding: 12px;
      margin: 5px 0;
      background: #2a2a2a;
      border: 1px solid #444;
      border-radius: 8px;
      color: #fff;
    }
    .row {
      display: flex;
      gap: 15px;
    }
    .row > div {
      flex: 1;
    }
    input::placeholder { color: #666; }
    button {
      background: #4ecdc4;
      color: #000;
      border: none;
      padding: 14px 28px;
      border-radius: 8px;
      cursor: pointer;
      font-weight: 600;
      font-size: 16px;
      margin-top: 20px;
      width: 100%;
    }
    button:hover { background: #3dbdb5; }
    .hint {
      color: #666;
      font-size: 12px;
      margin-top: 5px;
    }
  </style>
</head>
<body>
  <a href="/" class="back">← Back to gallery</a>
  <h1>Edit: ${filename}</h1>
  
  <div class="preview">
    <img src="/${filename}?t=${Date.now()}" alt="${filename}">
    <div class="current-info">Current size: ${dimensions.width} × ${dimensions.height} px</div>
  </div>

  <div class="edit-form">
    <form action="/edit/${encodeURIComponent(filename)}" method="post">
      <label>New Filename (optional)</label>
      <input type="text" name="newName" placeholder="${baseName}" value="${baseName}">
      <p class="hint">Leave as-is to keep current name</p>
      
      <label>Resize (optional - leave empty to keep current size)</label>
      <div class="row">
        <div>
          <input type="number" name="width" placeholder="Width (px)" min="1" max="4000">
        </div>
        <div>
          <input type="number" name="height" placeholder="Height (px)" min="1" max="4000">
        </div>
      </div>
      <p class="hint">Set only width or height to maintain aspect ratio. Current: ${dimensions.width}×${dimensions.height}</p>
      
      <label>Convert Format (optional)</label>
      <select name="format">
        <option value="">Keep current (${ext.toUpperCase()})</option>
        <option value="png">PNG</option>
        <option value="jpeg">JPEG</option>
        <option value="webp">WebP</option>
      </select>
      
      <button type="submit">Save Changes</button>
    </form>
  </div>
</body>
</html>
  `);
});

// Handle edit
app.post('/edit/:filename', async (req, res) => {
  try {
    const oldFilename = req.params.filename;
    const oldPath = path.join(uploadsDir, oldFilename);
    
    if (!fs.existsSync(oldPath)) {
      return res.status(404).send('Image not found');
    }

    const newName = req.body.newName || path.basename(oldFilename, path.extname(oldFilename));
    const width = req.body.width ? parseInt(req.body.width) : null;
    const height = req.body.height ? parseInt(req.body.height) : null;
    const format = req.body.format || null;

    // Determine new extension
    let ext = path.extname(oldFilename).toLowerCase();
    if (format) {
      ext = '.' + format;
    }
    const newFilename = newName + ext;
    const newPath = path.join(uploadsDir, newFilename);

    // Read original image
    let sharpInstance = sharp(oldPath);

    // Resize if dimensions provided
    if (width || height) {
      sharpInstance = sharpInstance.resize(width, height, {
        fit: 'inside',
        withoutEnlargement: false
      });
    }

    // Convert format if specified
    if (format === 'png') {
      sharpInstance = sharpInstance.png();
    } else if (format === 'jpeg') {
      sharpInstance = sharpInstance.jpeg({ quality: 85 });
    } else if (format === 'webp') {
      sharpInstance = sharpInstance.webp({ quality: 85 });
    }

    // Save to temp file first (in case old and new are the same)
    const tempPath = path.join(uploadsDir, '_temp_' + Date.now() + ext);
    await sharpInstance.toFile(tempPath);

    // Delete old file if different name
    if (oldFilename !== newFilename && fs.existsSync(oldPath)) {
      fs.unlinkSync(oldPath);
    } else if (oldFilename === newFilename) {
      fs.unlinkSync(oldPath);
    }

    // Rename temp to final
    fs.renameSync(tempPath, newPath);

    const imageUrl = `${req.protocol}://${req.get('host')}/${newFilename}`;
    
    res.send(`
<!DOCTYPE html>
<html>
<head>
  <title>Edit Success</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    body { 
      font-family: -apple-system, BlinkMacSystemFont, sans-serif;
      max-width: 600px; 
      margin: 50px auto; 
      padding: 20px;
      background: #0f0f0f;
      color: #e0e0e0;
      text-align: center;
    }
    .success-box {
      background: #1a3a2a;
      border: 2px solid #4ecdc4;
      padding: 30px;
      border-radius: 12px;
    }
    h1 { color: #4ecdc4; }
    img { max-width: 100%; max-height: 300px; border-radius: 8px; margin: 20px 0; }
    .url {
      background: #2a2a2a;
      padding: 15px;
      border-radius: 8px;
      font-family: monospace;
      word-break: break-all;
      color: #4ecdc4;
      margin: 20px 0;
    }
    a { color: #4ecdc4; }
    button {
      background: #4ecdc4;
      color: #000;
      border: none;
      padding: 12px 24px;
      border-radius: 8px;
      cursor: pointer;
      font-weight: 600;
      margin: 10px;
    }
    .info {
      color: #888;
      font-size: 14px;
      margin-top: 10px;
    }
  </style>
</head>
<body>
  <div class="success-box">
    <h1>✅ Updated!</h1>
    <img src="/${newFilename}?t=${Date.now()}" alt="Updated image">
    <div class="url" id="imageUrl">${imageUrl}</div>
    <button onclick="navigator.clipboard.writeText('${imageUrl}')">Copy URL</button>
    <p class="info">${width || height ? `Resized to ${width || 'auto'}×${height || 'auto'}` : 'Size unchanged'}${format ? ` • Converted to ${format.toUpperCase()}` : ''}${oldFilename !== newFilename ? ` • Renamed from ${oldFilename}` : ''}</p>
    <br>
    <a href="/">← Back to gallery</a>
  </div>
</body>
</html>
    `);
  } catch (err) {
    console.error(err);
    res.status(500).send('Error processing image: ' + err.message);
  }
});

// Handle upload with resize
app.post('/upload', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).send('No file uploaded');
    }

    const customName = req.body.customName;
    const width = req.body.width ? parseInt(req.body.width) : null;
    const height = req.body.height ? parseInt(req.body.height) : null;
    const format = req.body.format || null;

    // Determine filename
    let ext = path.extname(req.file.originalname).toLowerCase();
    if (format) {
      ext = '.' + format;
    }
    const baseName = customName || path.basename(req.file.originalname, path.extname(req.file.originalname));
    const filename = baseName + ext;
    const outputPath = path.join(uploadsDir, filename);

    // Process image with sharp
    let sharpInstance = sharp(req.file.buffer);

    // Resize if dimensions provided
    if (width || height) {
      sharpInstance = sharpInstance.resize(width, height, {
        fit: 'inside',
        withoutEnlargement: true
      });
    }

    // Convert format if specified
    if (format === 'png') {
      sharpInstance = sharpInstance.png();
    } else if (format === 'jpeg') {
      sharpInstance = sharpInstance.jpeg({ quality: 85 });
    } else if (format === 'webp') {
      sharpInstance = sharpInstance.webp({ quality: 85 });
    }

    // Save the processed image
    await sharpInstance.toFile(outputPath);

    const imageUrl = `${req.protocol}://${req.get('host')}/${filename}`;
    
    res.send(`
<!DOCTYPE html>
<html>
<head>
  <title>Upload Success</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    body { 
      font-family: -apple-system, BlinkMacSystemFont, sans-serif;
      max-width: 600px; 
      margin: 50px auto; 
      padding: 20px;
      background: #0f0f0f;
      color: #e0e0e0;
      text-align: center;
    }
    .success-box {
      background: #1a3a2a;
      border: 2px solid #4ecdc4;
      padding: 30px;
      border-radius: 12px;
    }
    h1 { color: #4ecdc4; }
    img { max-width: 100%; max-height: 300px; border-radius: 8px; margin: 20px 0; }
    .url {
      background: #2a2a2a;
      padding: 15px;
      border-radius: 8px;
      font-family: monospace;
      word-break: break-all;
      color: #4ecdc4;
      margin: 20px 0;
    }
    a { color: #4ecdc4; }
    button {
      background: #4ecdc4;
      color: #000;
      border: none;
      padding: 12px 24px;
      border-radius: 8px;
      cursor: pointer;
      font-weight: 600;
      margin: 10px;
    }
    .info {
      color: #888;
      font-size: 14px;
      margin-top: 10px;
    }
  </style>
</head>
<body>
  <div class="success-box">
    <h1>✅ Uploaded!</h1>
    <img src="/${filename}?t=${Date.now()}" alt="Uploaded image">
    <div class="url" id="imageUrl">${imageUrl}</div>
    <button onclick="navigator.clipboard.writeText('${imageUrl}')">Copy URL</button>
    <p class="info">${width || height ? `Resized to ${width || 'auto'}×${height || 'auto'}` : 'Original size'}${format ? ` • Converted to ${format.toUpperCase()}` : ''}</p>
    <br>
    <a href="/">← Back to gallery</a>
  </div>
</body>
</html>
    `);
  } catch (err) {
    console.error(err);
    res.status(500).send('Error processing image: ' + err.message);
  }
});

// Delete image
app.delete('/delete/:filename', (req, res) => {
  const filename = req.params.filename;
  const filepath = path.join(uploadsDir, filename);
  
  if (fs.existsSync(filepath)) {
    fs.unlinkSync(filepath);
    res.json({ success: true });
  } else {
    res.status(404).json({ error: 'File not found' });
  }
});

app.listen(PORT, () => {
  console.log(`Image hosting running on port ${PORT}`);
});
