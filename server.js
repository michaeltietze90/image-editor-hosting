const express = require('express');
const multer = require('multer');
const path = require('path');
const sharp = require('sharp');
const { Pool } = require('pg');
const GIFEncoder = require('gif-encoder-2');
const { createCanvas, Image } = require('canvas');

const app = express();
const PORT = process.env.PORT || 3000;

// Parse URL-encoded bodies for edit form
app.use(express.urlencoded({ extended: true }));

// Database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false
});

// Initialize database table
async function initDB() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS images (
        id SERIAL PRIMARY KEY,
        filename VARCHAR(255) UNIQUE NOT NULL,
        mimetype VARCHAR(100) NOT NULL,
        data BYTEA NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('Database initialized');
  } catch (err) {
    console.error('Database init error:', err);
  }
}
initDB();

// Use memory storage for multer
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (req, file, cb) => {
    const allowed = /jpeg|jpg|png|gif|webp/;
    const ext = allowed.test(path.extname(file.originalname).toLowerCase());
    const mime = allowed.test(file.mimetype);
    if (ext && mime) {
      cb(null, true);
    } else {
      cb(new Error('Only images allowed (jpg, png, gif, webp)'));
    }
  }
});

// Serve images from database
app.get('/:filename', async (req, res, next) => {
  // Skip if it looks like a route
  if (['upload', 'edit', 'delete', 'favicon.ico', 'gif', 'create-gif'].includes(req.params.filename)) {
    return next();
  }
  
  try {
    const result = await pool.query(
      'SELECT data, mimetype FROM images WHERE filename = $1',
      [req.params.filename]
    );
    
    if (result.rows.length === 0) {
      return next(); // Let it fall through to 404
    }
    
    const image = result.rows[0];
    res.set('Content-Type', image.mimetype);
    res.set('Cache-Control', 'public, max-age=31536000');
    res.send(image.data);
  } catch (err) {
    console.error('Error serving image:', err);
    next(err);
  }
});

// Common styles
const commonStyles = `
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
    h2 { color: #4ecdc4; }
    .upload-form, .gif-form {
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
    .copy-btn { background: #555; }
    .edit-btn { background: #5588cc; }
    .gif-btn { background: #cc55aa; }
    .delete-btn { background: #c44; }
    .hint { color: #666; font-size: 12px; margin-top: 5px; }
    .size-info { color: #666; font-size: 12px; }
    .nav { margin-bottom: 20px; }
    .nav a { color: #4ecdc4; margin-right: 20px; text-decoration: none; }
    .nav a:hover { text-decoration: underline; }
    .back { color: #4ecdc4; text-decoration: none; display: inline-block; margin-bottom: 20px; }
`;

// Upload page
app.get('/', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT filename, LENGTH(data) as size FROM images ORDER BY created_at DESC'
    );
    const images = result.rows;

    res.send(`
<!DOCTYPE html>
<html>
<head>
  <title>Image Hosting</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>${commonStyles}</style>
</head>
<body>
  <div class="nav">
    <a href="/">📷 Upload</a>
    <a href="/gif">🎬 GIF Creator</a>
  </div>
  
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
        <img src="/${img.filename}?t=${Date.now()}" alt="${img.filename}">
        <div class="image-info">
          <strong>${img.filename}</strong>
          <span class="size-info">${(img.size / 1024).toFixed(1)} KB</span>
          <div class="url-box" id="url-${img.filename}">${req.protocol}://${req.get('host')}/${img.filename}</div>
          <div class="btn-group">
            <button class="btn-small copy-btn" onclick="copyUrl('${img.filename}')">Copy URL</button>
            <a class="btn btn-small edit-btn" href="/edit/${encodeURIComponent(img.filename)}">Edit / Resize</a>
            <a class="btn btn-small gif-btn" href="/gif?source=${encodeURIComponent(img.filename)}">Make GIF</a>
            <button class="btn-small delete-btn" onclick="deleteImg('${img.filename}')">Delete</button>
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
  } catch (err) {
    console.error('Error loading images:', err);
    res.status(500).send('Database error: ' + err.message);
  }
});

// GIF Creator page
app.get('/gif', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT filename FROM images ORDER BY created_at DESC'
    );
    const images = result.rows;
    const sourceImage = req.query.source || '';

    res.send(`
<!DOCTYPE html>
<html>
<head>
  <title>GIF Creator</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>${commonStyles}
    .preview-container {
      background: #1a1a1a;
      padding: 20px;
      border-radius: 12px;
      border: 1px solid #333;
      margin-bottom: 20px;
      text-align: center;
    }
    .preview-container img {
      max-width: 100%;
      max-height: 200px;
      border-radius: 8px;
    }
    #preview { display: ${sourceImage ? 'block' : 'none'}; }
  </style>
</head>
<body>
  <div class="nav">
    <a href="/">📷 Upload</a>
    <a href="/gif">🎬 GIF Creator</a>
  </div>
  
  <h1>🎬 GIF Creator</h1>
  <p style="color:#888">Create a GIF that shows an image for X seconds, then disappears. Plays only once.</p>
  
  <div class="gif-form">
    <form action="/create-gif" method="post" enctype="multipart/form-data">
      
      <label>Use Existing Image</label>
      <select name="existingImage" id="existingImage" onchange="updatePreview()">
        <option value="">-- Or upload new below --</option>
        ${images.map(img => `<option value="${img.filename}" ${img.filename === sourceImage ? 'selected' : ''}>${img.filename}</option>`).join('')}
      </select>
      
      <div id="preview" class="preview-container">
        <img id="previewImg" src="${sourceImage ? '/' + sourceImage : ''}" alt="Preview">
      </div>
      
      <label>Or Upload New Image</label>
      <input type="file" name="image" accept="image/*">
      
      <label>Show Duration (seconds)</label>
      <input type="number" name="duration" value="3" min="0.5" max="30" step="0.5" required>
      <p class="hint">How long the image stays visible before disappearing</p>
      
      <label>Output Filename</label>
      <input type="text" name="outputName" placeholder="my-animation" required>
      
      <label>Resize (optional)</label>
      <div class="row">
        <div>
          <input type="number" name="width" placeholder="Width (px)" min="1" max="1000">
        </div>
        <div>
          <input type="number" name="height" placeholder="Height (px)" min="1" max="1000">
        </div>
      </div>
      <p class="hint">Leave empty to use original size (max 1000px recommended for GIFs)</p>
      
      <button type="submit" style="margin-top:20px">Create GIF</button>
    </form>
  </div>
  
  <script>
    function updatePreview() {
      const select = document.getElementById('existingImage');
      const preview = document.getElementById('preview');
      const previewImg = document.getElementById('previewImg');
      
      if (select.value) {
        previewImg.src = '/' + select.value + '?t=' + Date.now();
        preview.style.display = 'block';
      } else {
        preview.style.display = 'none';
      }
    }
  </script>
</body>
</html>
    `);
  } catch (err) {
    console.error('Error loading GIF page:', err);
    res.status(500).send('Error: ' + err.message);
  }
});

// Create GIF endpoint
app.post('/create-gif', upload.single('image'), async (req, res) => {
  try {
    let imageBuffer;
    
    // Get image from existing or uploaded
    if (req.body.existingImage) {
      const result = await pool.query(
        'SELECT data FROM images WHERE filename = $1',
        [req.body.existingImage]
      );
      if (result.rows.length === 0) {
        return res.status(404).send('Source image not found');
      }
      imageBuffer = result.rows[0].data;
    } else if (req.file) {
      imageBuffer = req.file.buffer;
    } else {
      return res.status(400).send('No image provided');
    }

    const duration = parseFloat(req.body.duration) || 3;
    const outputName = req.body.outputName || 'animation';
    const targetWidth = req.body.width ? parseInt(req.body.width) : null;
    const targetHeight = req.body.height ? parseInt(req.body.height) : null;

    // Process image with sharp to get raw pixel data
    let sharpInstance = sharp(imageBuffer);
    
    // Get original dimensions
    const metadata = await sharpInstance.metadata();
    let width = metadata.width;
    let height = metadata.height;

    // Resize if specified
    if (targetWidth || targetHeight) {
      sharpInstance = sharpInstance.resize(targetWidth, targetHeight, {
        fit: 'inside',
        withoutEnlargement: true
      });
      const resizedMeta = await sharpInstance.toBuffer().then(buf => sharp(buf).metadata());
      width = resizedMeta.width;
      height = resizedMeta.height;
    }

    // Limit size for GIF performance
    if (width > 1000 || height > 1000) {
      const scale = Math.min(1000 / width, 1000 / height);
      width = Math.round(width * scale);
      height = Math.round(height * scale);
      sharpInstance = sharp(imageBuffer).resize(width, height);
    }

    // Get raw RGBA data
    const rawBuffer = await sharpInstance
      .ensureAlpha()
      .raw()
      .toBuffer();

    // Create GIF encoder
    const encoder = new GIFEncoder(width, height, 'neuquant', true); // true = use global palette
    encoder.setRepeat(-1); // -1 = no repeat (play once)
    encoder.setDelay(duration * 1000); // delay in ms
    encoder.setQuality(10);
    encoder.setTransparent(0x000000);

    // Start encoding
    encoder.start();

    // Create canvas for the image frame
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    // Draw the image frame
    const imageData = ctx.createImageData(width, height);
    imageData.data.set(rawBuffer);
    ctx.putImageData(imageData, 0, 0);
    encoder.addFrame(ctx);

    // Create transparent/empty frame
    ctx.clearRect(0, 0, width, height);
    encoder.setDelay(100); // Short delay for final frame
    encoder.addFrame(ctx);

    // Finish encoding
    encoder.finish();

    // Get the GIF buffer
    const gifBuffer = encoder.out.getData();

    // Save to database
    const filename = outputName + '.gif';
    await pool.query(
      `INSERT INTO images (filename, mimetype, data) VALUES ($1, $2, $3)
       ON CONFLICT (filename) DO UPDATE SET mimetype = $2, data = $3`,
      [filename, 'image/gif', gifBuffer]
    );

    const imageUrl = `${req.protocol}://${req.get('host')}/${filename}`;

    res.send(`
<!DOCTYPE html>
<html>
<head>
  <title>GIF Created</title>
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
    img { max-width: 100%; max-height: 300px; border-radius: 8px; margin: 20px 0; background: #333; }
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
    .reload-btn {
      background: #555;
      margin-top: 10px;
    }
  </style>
</head>
<body>
  <div class="success-box">
    <h1>🎬 GIF Created!</h1>
    <p class="info">${width}×${height}px • Shows for ${duration}s then disappears • Plays once</p>
    <img id="gifPreview" src="/${filename}?t=${Date.now()}" alt="Created GIF">
    <button class="reload-btn" onclick="replayGif()">▶ Replay GIF</button>
    <div class="url" id="imageUrl">${imageUrl}</div>
    <button onclick="navigator.clipboard.writeText('${imageUrl}')">Copy URL</button>
    <br><br>
    <a href="/gif">← Create another</a> | <a href="/">← Back to gallery</a>
  </div>
  <script>
    function replayGif() {
      const img = document.getElementById('gifPreview');
      img.src = '/${filename}?t=' + Date.now();
    }
  </script>
</body>
</html>
    `);
  } catch (err) {
    console.error('Error creating GIF:', err);
    res.status(500).send('Error creating GIF: ' + err.message);
  }
});

// Edit page for existing image
app.get('/edit/:filename', async (req, res) => {
  const filename = req.params.filename;
  
  try {
    const result = await pool.query(
      'SELECT data, mimetype FROM images WHERE filename = $1',
      [filename]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).send('Image not found');
    }

    // Get image dimensions
    let dimensions = { width: 0, height: 0 };
    try {
      const metadata = await sharp(result.rows[0].data).metadata();
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
  } catch (err) {
    console.error('Error loading image for edit:', err);
    res.status(500).send('Error: ' + err.message);
  }
});

// Handle edit
app.post('/edit/:filename', async (req, res) => {
  try {
    const oldFilename = req.params.filename;
    
    // Get existing image from database
    const result = await pool.query(
      'SELECT data, mimetype FROM images WHERE filename = $1',
      [oldFilename]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).send('Image not found');
    }

    const oldImage = result.rows[0];
    const newName = req.body.newName || path.basename(oldFilename, path.extname(oldFilename));
    const width = req.body.width ? parseInt(req.body.width) : null;
    const height = req.body.height ? parseInt(req.body.height) : null;
    const format = req.body.format || null;

    // Determine new extension and mimetype
    let ext = path.extname(oldFilename).toLowerCase();
    let mimetype = oldImage.mimetype;
    if (format) {
      ext = '.' + format;
      mimetype = 'image/' + (format === 'jpg' ? 'jpeg' : format);
    }
    const newFilename = newName + ext;

    // Process image with sharp
    let sharpInstance = sharp(oldImage.data);

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

    // Get processed buffer
    const newBuffer = await sharpInstance.toBuffer();

    // Update or insert in database
    if (oldFilename === newFilename) {
      await pool.query(
        'UPDATE images SET data = $1, mimetype = $2 WHERE filename = $3',
        [newBuffer, mimetype, oldFilename]
      );
    } else {
      // Delete old, insert new
      await pool.query('DELETE FROM images WHERE filename = $1', [oldFilename]);
      await pool.query(
        'INSERT INTO images (filename, mimetype, data) VALUES ($1, $2, $3)',
        [newFilename, mimetype, newBuffer]
      );
    }

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
    console.error('Error editing image:', err);
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

    // Determine filename and mimetype
    let ext = path.extname(req.file.originalname).toLowerCase();
    let mimetype = req.file.mimetype;
    if (format) {
      ext = '.' + format;
      mimetype = 'image/' + (format === 'jpg' ? 'jpeg' : format);
    }
    const baseName = customName || path.basename(req.file.originalname, path.extname(req.file.originalname));
    const filename = baseName + ext;

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

    // Get processed buffer
    const buffer = await sharpInstance.toBuffer();

    // Save to database (upsert)
    await pool.query(
      `INSERT INTO images (filename, mimetype, data) VALUES ($1, $2, $3)
       ON CONFLICT (filename) DO UPDATE SET mimetype = $2, data = $3`,
      [filename, mimetype, buffer]
    );

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
    console.error('Error uploading image:', err);
    res.status(500).send('Error processing image: ' + err.message);
  }
});

// Delete image
app.delete('/delete/:filename', async (req, res) => {
  try {
    const result = await pool.query(
      'DELETE FROM images WHERE filename = $1 RETURNING filename',
      [req.params.filename]
    );
    
    if (result.rowCount > 0) {
      res.json({ success: true });
    } else {
      res.status(404).json({ error: 'File not found' });
    }
  } catch (err) {
    console.error('Error deleting image:', err);
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`Image hosting running on port ${PORT}`);
});
