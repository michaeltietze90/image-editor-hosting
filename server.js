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

// Initialize database tables
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
    
    // Static links table - permanent URLs that can point to different images
    await pool.query(`
      CREATE TABLE IF NOT EXISTS static_links (
        id SERIAL PRIMARY KEY,
        slug VARCHAR(100) UNIQUE NOT NULL,
        image_filename VARCHAR(255),
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

// Parse JSON for editor
app.use(express.json({ limit: '10mb' }));

// Serve images from database
app.get('/:filename', async (req, res, next) => {
  // Skip if it looks like a route
  if (['upload', 'edit', 'delete', 'favicon.ico', 'gif', 'create-gif', 'editor', 'save-editor', 'links', 'create-link', 'update-link', 'delete-link'].includes(req.params.filename)) {
    return next();
  }
  
  // Check if this is a static link first
  try {
    const linkResult = await pool.query(
      'SELECT image_filename FROM static_links WHERE slug = $1',
      [req.params.filename]
    );
    
    if (linkResult.rows.length > 0 && linkResult.rows[0].image_filename) {
      // Redirect to the actual image
      const imageResult = await pool.query(
        'SELECT data, mimetype FROM images WHERE filename = $1',
        [linkResult.rows[0].image_filename]
      );
      
      if (imageResult.rows.length > 0) {
        const image = imageResult.rows[0];
        res.set('Content-Type', image.mimetype);
        res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
        return res.send(image.data);
      }
    }
  } catch (err) {
    console.error('Error checking static link:', err);
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
    <a href="/editor">🎯 Editor</a>
    <a href="/links">🔗 Static Links</a>
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
            <a class="btn btn-small" style="background:#aa8844" href="/editor?source=${encodeURIComponent(img.filename)}">Editor</a>
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
    <a href="/editor">🎯 Editor</a>
    <a href="/links">🔗 Static Links</a>
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

// Editor page - position and resize images for Proto M
app.get('/editor', async (req, res) => {
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
  <title>Proto M Editor</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { 
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #0a0a0a;
      color: #e0e0e0;
      min-height: 100vh;
    }
    .nav { 
      padding: 15px 20px; 
      background: #1a1a1a;
      border-bottom: 1px solid #333;
    }
    .nav a { color: #4ecdc4; margin-right: 20px; text-decoration: none; }
    .editor-container {
      display: flex;
      height: calc(100vh - 60px);
    }
    .sidebar {
      width: 300px;
      background: #1a1a1a;
      padding: 20px;
      overflow-y: auto;
      border-right: 1px solid #333;
    }
    .canvas-area {
      flex: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      background: #0a0a0a;
      padding: 20px;
      overflow: auto;
    }
    .canvas-wrapper {
      position: relative;
      background: repeating-conic-gradient(#333 0% 25%, #222 0% 50%) 50% / 20px 20px;
      box-shadow: 0 0 50px rgba(78, 205, 196, 0.2);
      border: 2px solid #333;
    }
    #canvas {
      display: block;
    }
    .bg-toggle { margin-bottom: 15px; }
    .bg-toggle label { display: inline; margin-left: 8px; cursor: pointer; }
    h2 { color: #4ecdc4; font-size: 16px; margin-bottom: 15px; }
    h3 { color: #888; font-size: 13px; margin: 20px 0 10px; text-transform: uppercase; }
    label {
      display: block;
      color: #aaa;
      font-size: 13px;
      margin-bottom: 5px;
    }
    select, input[type="text"], input[type="number"] {
      width: 100%;
      padding: 10px;
      margin-bottom: 15px;
      background: #2a2a2a;
      border: 1px solid #444;
      border-radius: 6px;
      color: #fff;
      font-size: 14px;
    }
    .row {
      display: flex;
      gap: 10px;
    }
    .row > div { flex: 1; }
    input[type="range"] {
      width: 100%;
      margin: 10px 0;
    }
    .slider-value {
      text-align: center;
      color: #4ecdc4;
      font-size: 14px;
      margin-bottom: 10px;
    }
    button {
      width: 100%;
      padding: 12px;
      background: #4ecdc4;
      color: #000;
      border: none;
      border-radius: 6px;
      font-weight: 600;
      cursor: pointer;
      margin-bottom: 10px;
    }
    button:hover { background: #3dbdb5; }
    .btn-secondary {
      background: #555;
      color: #fff;
    }
    .btn-gif {
      background: #cc55aa;
    }
    .presets {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 8px;
      margin-bottom: 15px;
    }
    .preset-btn {
      padding: 8px;
      font-size: 12px;
    }
    .info {
      color: #666;
      font-size: 12px;
      margin-top: 5px;
    }
    .coord-display {
      background: #2a2a2a;
      padding: 10px;
      border-radius: 6px;
      font-family: monospace;
      font-size: 12px;
      margin-bottom: 15px;
    }
    .coord-display span { color: #4ecdc4; }
  </style>
</head>
<body>
  <div class="nav">
    <a href="/">📷 Upload</a>
    <a href="/gif">🎬 GIF Creator</a>
    <a href="/editor">🎯 Editor</a>
    <a href="/links">🔗 Static Links</a>
  </div>
  
  <div class="editor-container">
    <div class="sidebar">
      <h2>🎯 Proto M Editor</h2>
      
      <h3>Background</h3>
      <div class="bg-toggle">
        <input type="checkbox" id="bgToggle" onchange="toggleBg()">
        <label for="bgToggle">Add background color</label>
      </div>
      <div id="bgColorPicker" style="display:none; margin-bottom:15px;">
        <input type="color" id="bgColorInput" value="#000000" onchange="updateBgColor()" style="width:100%; height:40px; border:none; cursor:pointer;">
      </div>
      
      <h3>Canvas Size</h3>
      <div class="presets">
        <button class="preset-btn" onclick="setCanvasSize(1080, 1920)">1080×1920</button>
        <button class="preset-btn" onclick="setCanvasSize(2160, 3840)">2160×3840</button>
        <button class="preset-btn" onclick="setCanvasSize(540, 960)">540×960</button>
        <button class="preset-btn btn-secondary" onclick="setCanvasSize(1920, 1080)">1920×1080</button>
      </div>
      
      <h3>Select Image</h3>
      <select id="imageSelect" onchange="loadImage()">
        <option value="">-- Select image --</option>
        ${images.map(img => '<option value="' + img.filename + '"' + (img.filename === sourceImage ? ' selected' : '') + '>' + img.filename + '</option>').join('')}
      </select>
      
      <h3>Position</h3>
      <div class="coord-display">
        X: <span id="posX">0</span> | Y: <span id="posY">0</span> | 
        W: <span id="imgW">0</span> × H: <span id="imgH">0</span>
      </div>
      
      <div class="row">
        <div>
          <label>X Position</label>
          <input type="number" id="inputX" value="0" onchange="updateFromInputs()">
        </div>
        <div>
          <label>Y Position</label>
          <input type="number" id="inputY" value="0" onchange="updateFromInputs()">
        </div>
      </div>
      
      <h3>Scale</h3>
      <input type="range" id="scaleSlider" min="10" max="300" value="100" oninput="updateScale()">
      <div class="slider-value"><span id="scaleValue">100</span>%</div>
      
      <div class="row">
        <div>
          <label>Width</label>
          <input type="number" id="inputW" value="0" onchange="updateFromSize()">
        </div>
        <div>
          <label>Height</label>
          <input type="number" id="inputH" value="0" onchange="updateFromSize()">
        </div>
      </div>
      
      <h3>Quick Position</h3>
      <div class="presets">
        <button class="preset-btn btn-secondary" onclick="positionPreset('tl')">↖ Top-Left</button>
        <button class="preset-btn btn-secondary" onclick="positionPreset('tr')">↗ Top-Right</button>
        <button class="preset-btn btn-secondary" onclick="positionPreset('center')">⊙ Center</button>
        <button class="preset-btn btn-secondary" onclick="positionPreset('fit')">⊡ Fit</button>
        <button class="preset-btn btn-secondary" onclick="positionPreset('bl')">↙ Bottom-Left</button>
        <button class="preset-btn btn-secondary" onclick="positionPreset('br')">↘ Bottom-Right</button>
      </div>
      
      <h3>Save</h3>
      <label>Output Filename</label>
      <input type="text" id="outputName" placeholder="proto-image">
      
      <button onclick="saveImage()">💾 Save as PNG</button>
      <button class="btn-gif" onclick="saveAsGif()">🎬 Save as GIF (show then hide)</button>
      
      <div id="gifOptions" style="display:none; margin-top:10px;">
        <label>Show Duration (seconds)</label>
        <input type="number" id="gifDuration" value="3" min="0.5" max="30" step="0.5">
      </div>
      
      <p class="info">Drag the image to move it. Use scroll or slider to resize.</p>
    </div>
    
    <div class="canvas-area">
      <div class="canvas-wrapper">
        <canvas id="canvas" width="1080" height="1920"></canvas>
      </div>
    </div>
  </div>
  
  <script>
    const canvas = document.getElementById('canvas');
    const ctx = canvas.getContext('2d');
    
    let img = null;
    let imgX = 0, imgY = 0;
    let imgScale = 1;
    let originalW = 0, originalH = 0;
    let isDragging = false;
    let dragStartX = 0, dragStartY = 0;
    
    // Scale canvas display for screen
    function updateCanvasDisplay() {
      const maxH = window.innerHeight - 100;
      const scale = Math.min(1, maxH / canvas.height, 600 / canvas.width);
      canvas.style.width = (canvas.width * scale) + 'px';
      canvas.style.height = (canvas.height * scale) + 'px';
    }
    
    function setCanvasSize(w, h) {
      canvas.width = w;
      canvas.height = h;
      updateCanvasDisplay();
      draw();
    }
    
    function loadImage() {
      const filename = document.getElementById('imageSelect').value;
      if (!filename) return;
      
      img = new window.Image();
      img.crossOrigin = 'anonymous';
      img.onload = function() {
        originalW = img.width;
        originalH = img.height;
        imgScale = 1;
        
        // Center image
        imgX = (canvas.width - originalW) / 2;
        imgY = (canvas.height - originalH) / 2;
        
        document.getElementById('scaleSlider').value = 100;
        updateDisplay();
        draw();
      };
      img.src = '/' + filename + '?t=' + Date.now();
    }
    
    let useBgColor = false;
    let bgColor = '#000000';
    
    function toggleBg() {
      useBgColor = document.getElementById('bgToggle').checked;
      document.getElementById('bgColorPicker').style.display = useBgColor ? 'block' : 'none';
      draw();
    }
    
    function updateBgColor() {
      bgColor = document.getElementById('bgColorInput').value;
      draw();
    }
    
    function draw() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      if (useBgColor) {
        ctx.fillStyle = bgColor;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }
      
      if (img && img.complete) {
        const w = originalW * imgScale;
        const h = originalH * imgScale;
        ctx.drawImage(img, imgX, imgY, w, h);
      }
    }
    
    function updateDisplay() {
      const w = Math.round(originalW * imgScale);
      const h = Math.round(originalH * imgScale);
      
      document.getElementById('posX').textContent = Math.round(imgX);
      document.getElementById('posY').textContent = Math.round(imgY);
      document.getElementById('imgW').textContent = w;
      document.getElementById('imgH').textContent = h;
      
      document.getElementById('inputX').value = Math.round(imgX);
      document.getElementById('inputY').value = Math.round(imgY);
      document.getElementById('inputW').value = w;
      document.getElementById('inputH').value = h;
      document.getElementById('scaleValue').textContent = Math.round(imgScale * 100);
    }
    
    function updateFromInputs() {
      imgX = parseInt(document.getElementById('inputX').value) || 0;
      imgY = parseInt(document.getElementById('inputY').value) || 0;
      updateDisplay();
      draw();
    }
    
    function updateFromSize() {
      const newW = parseInt(document.getElementById('inputW').value) || originalW;
      if (originalW > 0) {
        imgScale = newW / originalW;
        document.getElementById('scaleSlider').value = imgScale * 100;
      }
      updateDisplay();
      draw();
    }
    
    function updateScale() {
      imgScale = document.getElementById('scaleSlider').value / 100;
      updateDisplay();
      draw();
    }
    
    function positionPreset(preset) {
      if (!img) return;
      const w = originalW * imgScale;
      const h = originalH * imgScale;
      
      switch(preset) {
        case 'tl': imgX = 0; imgY = 0; break;
        case 'tr': imgX = canvas.width - w; imgY = 0; break;
        case 'bl': imgX = 0; imgY = canvas.height - h; break;
        case 'br': imgX = canvas.width - w; imgY = canvas.height - h; break;
        case 'center': imgX = (canvas.width - w) / 2; imgY = (canvas.height - h) / 2; break;
        case 'fit':
          const fitScale = Math.min(canvas.width / originalW, canvas.height / originalH);
          imgScale = fitScale;
          document.getElementById('scaleSlider').value = fitScale * 100;
          imgX = (canvas.width - originalW * fitScale) / 2;
          imgY = (canvas.height - originalH * fitScale) / 2;
          break;
      }
      updateDisplay();
      draw();
    }
    
    // Mouse drag
    canvas.addEventListener('mousedown', (e) => {
      if (!img) return;
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      const x = (e.clientX - rect.left) * scaleX;
      const y = (e.clientY - rect.top) * scaleY;
      
      isDragging = true;
      dragStartX = x - imgX;
      dragStartY = y - imgY;
    });
    
    canvas.addEventListener('mousemove', (e) => {
      if (!isDragging) return;
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      const x = (e.clientX - rect.left) * scaleX;
      const y = (e.clientY - rect.top) * scaleY;
      
      imgX = x - dragStartX;
      imgY = y - dragStartY;
      updateDisplay();
      draw();
    });
    
    canvas.addEventListener('mouseup', () => isDragging = false);
    canvas.addEventListener('mouseleave', () => isDragging = false);
    
    // Scroll to resize
    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? 0.95 : 1.05;
      imgScale *= delta;
      imgScale = Math.max(0.1, Math.min(5, imgScale));
      document.getElementById('scaleSlider').value = imgScale * 100;
      updateDisplay();
      draw();
    });
    
    async function saveImage() {
      const name = document.getElementById('outputName').value || 'proto-image';
      const dataUrl = canvas.toDataURL('image/png');
      
      const response = await fetch('/save-editor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          imageData: dataUrl, 
          filename: name + '.png',
          mimetype: 'image/png'
        })
      });
      
      const result = await response.json();
      if (result.success) {
        alert('Saved! URL: ' + result.url);
        window.open(result.url, '_blank');
      } else {
        alert('Error: ' + result.error);
      }
    }
    
    function saveAsGif() {
      const opts = document.getElementById('gifOptions');
      opts.style.display = opts.style.display === 'none' ? 'block' : 'none';
      if (opts.style.display === 'block') {
        document.querySelector('.btn-gif').textContent = '✓ Create GIF Now';
        document.querySelector('.btn-gif').onclick = doSaveGif;
      }
    }
    
    async function doSaveGif() {
      const name = document.getElementById('outputName').value || 'proto-animation';
      const duration = document.getElementById('gifDuration').value || 3;
      const dataUrl = canvas.toDataURL('image/png');
      
      const response = await fetch('/save-editor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          imageData: dataUrl, 
          filename: name + '.gif',
          mimetype: 'image/gif',
          createGif: true,
          duration: parseFloat(duration)
        })
      });
      
      const result = await response.json();
      if (result.success) {
        alert('GIF Created! URL: ' + result.url);
        window.open(result.url, '_blank');
      } else {
        alert('Error: ' + result.error);
      }
    }
    
    // Init
    updateCanvasDisplay();
    window.addEventListener('resize', updateCanvasDisplay);
    ${sourceImage ? "document.getElementById('imageSelect').value = '" + sourceImage + "'; loadImage();" : ''}
  </script>
</body>
</html>
    `);
  } catch (err) {
    console.error('Error loading editor:', err);
    res.status(500).send('Error: ' + err.message);
  }
});

// Save editor output
app.post('/save-editor', async (req, res) => {
  try {
    const { imageData, filename, mimetype, createGif, duration } = req.body;
    
    // Convert base64 to buffer
    const base64Data = imageData.replace(/^data:image\/\w+;base64,/, '');
    let buffer = Buffer.from(base64Data, 'base64');
    
    let finalFilename = filename;
    let finalMimetype = mimetype;
    
    if (createGif) {
      // Create GIF from the image
      const metadata = await sharp(buffer).metadata();
      const width = metadata.width;
      const height = metadata.height;
      
      const rawBuffer = await sharp(buffer).ensureAlpha().raw().toBuffer();
      
      const encoder = new GIFEncoder(width, height, 'neuquant', true);
      encoder.setRepeat(-1); // No repeat
      encoder.setDelay(duration * 1000);
      encoder.setQuality(10);
      
      encoder.start();
      
      const canvas = createCanvas(width, height);
      const ctx = canvas.getContext('2d');
      
      // Draw image frame
      const imageData2 = ctx.createImageData(width, height);
      imageData2.data.set(rawBuffer);
      ctx.putImageData(imageData2, 0, 0);
      encoder.addFrame(ctx);
      
      // Transparent frame
      ctx.clearRect(0, 0, width, height);
      encoder.setDelay(100);
      encoder.addFrame(ctx);
      
      encoder.finish();
      buffer = encoder.out.getData();
      finalMimetype = 'image/gif';
    }
    
    // Save to database
    await pool.query(
      `INSERT INTO images (filename, mimetype, data) VALUES ($1, $2, $3)
       ON CONFLICT (filename) DO UPDATE SET mimetype = $2, data = $3`,
      [finalFilename, finalMimetype, buffer]
    );
    
    res.json({ 
      success: true, 
      url: req.protocol + '://' + req.get('host') + '/' + finalFilename
    });
  } catch (err) {
    console.error('Error saving editor image:', err);
    res.json({ success: false, error: err.message });
  }
});

// Static Links management page
app.get('/links', async (req, res) => {
  try {
    const linksResult = await pool.query(
      'SELECT slug, image_filename, created_at FROM static_links ORDER BY created_at DESC'
    );
    const links = linksResult.rows;
    
    const imagesResult = await pool.query(
      'SELECT filename FROM images ORDER BY created_at DESC'
    );
    const images = imagesResult.rows;
    
    const baseUrl = req.protocol + '://' + req.get('host');

    res.send(`
<!DOCTYPE html>
<html>
<head>
  <title>Static Links</title>
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
    h1 { color: #4ecdc4; margin-bottom: 10px; }
    h2 { color: #4ecdc4; margin-top: 30px; }
    .nav { margin-bottom: 20px; }
    .nav a { color: #4ecdc4; margin-right: 20px; text-decoration: none; }
    .description { color: #888; margin-bottom: 30px; }
    .form-box {
      background: #1a1a1a;
      padding: 20px;
      border-radius: 12px;
      margin-bottom: 30px;
      border: 1px solid #333;
    }
    label { display: block; color: #aaa; font-size: 14px; margin-bottom: 5px; }
    input[type="text"], select {
      width: 100%;
      padding: 12px;
      margin-bottom: 15px;
      background: #2a2a2a;
      border: 1px solid #444;
      border-radius: 8px;
      color: #fff;
      font-size: 14px;
    }
    button {
      background: #4ecdc4;
      color: #000;
      border: none;
      padding: 12px 24px;
      border-radius: 8px;
      font-weight: 600;
      cursor: pointer;
    }
    button:hover { background: #3dbdb5; }
    .link-item {
      background: #1a1a1a;
      padding: 20px;
      margin: 15px 0;
      border-radius: 12px;
      border: 1px solid #333;
    }
    .link-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 15px;
    }
    .link-slug {
      font-size: 20px;
      font-weight: bold;
      color: #4ecdc4;
    }
    .link-url {
      background: #2a2a2a;
      padding: 10px 15px;
      border-radius: 6px;
      font-family: monospace;
      font-size: 14px;
      color: #4ecdc4;
      margin-bottom: 15px;
      word-break: break-all;
    }
    .link-preview {
      display: flex;
      align-items: center;
      gap: 15px;
    }
    .link-preview img {
      width: 100px;
      height: 70px;
      object-fit: cover;
      border-radius: 6px;
      background: #333;
    }
    .link-controls {
      display: flex;
      gap: 10px;
      align-items: center;
      flex: 1;
    }
    .link-controls select {
      margin-bottom: 0;
      flex: 1;
    }
    .btn-small {
      padding: 8px 16px;
      font-size: 13px;
    }
    .btn-delete {
      background: #c44;
    }
    .btn-copy {
      background: #555;
    }
    .empty-state {
      text-align: center;
      color: #666;
      padding: 40px;
    }
    .hint { color: #666; font-size: 12px; margin-top: -10px; margin-bottom: 15px; }
  </style>
</head>
<body>
  <div class="nav">
    <a href="/">📷 Upload</a>
    <a href="/gif">🎬 GIF Creator</a>
    <a href="/editor">🎯 Editor</a>
    <a href="/links">🔗 Static Links</a>
  </div>
  
  <h1>🔗 Static Links</h1>
  <p class="description">Create permanent URLs that always work. Change which image they show anytime - perfect for Proto M!</p>
  
  <div class="form-box">
    <form action="/create-link" method="post">
      <label>Link Name (URL slug)</label>
      <input type="text" name="slug" placeholder="e.g., display1, main-logo, promo" required pattern="[a-zA-Z0-9_-]+">
      <p class="hint">Letters, numbers, dashes, underscores only. This becomes: ${baseUrl}/your-name</p>
      
      <label>Assign Image (optional - can set later)</label>
      <select name="imageFilename">
        <option value="">-- None --</option>
        ${images.map(img => '<option value="' + img.filename + '">' + img.filename + '</option>').join('')}
      </select>
      
      <button type="submit">Create Static Link</button>
    </form>
  </div>
  
  <h2>Your Static Links (${links.length})</h2>
  
  ${links.length === 0 ? '<div class="empty-state">No static links yet. Create one above!</div>' : ''}
  
  ${links.map(link => {
    const fullUrl = baseUrl + '/' + link.slug;
    const imgPreview = link.image_filename 
      ? '<img src="/' + link.image_filename + '?t=' + Date.now() + '" alt="preview">' 
      : '';
    const imgOptions = images.map(img => {
      const sel = img.filename === link.image_filename ? ' selected' : '';
      return '<option value="' + img.filename + '"' + sel + '>' + img.filename + '</option>';
    }).join('');
    
    return '<div class="link-item">' +
      '<div class="link-header">' +
        '<span class="link-slug">/' + link.slug + '</span>' +
        '<button class="btn-small btn-delete" onclick="deleteLink(&quot;' + link.slug + '&quot;)">Delete</button>' +
      '</div>' +
      '<div class="link-url">' + fullUrl + '</div>' +
      '<div class="link-preview">' +
        imgPreview +
        '<div class="link-controls">' +
          '<select onchange="updateLink(&quot;' + link.slug + '&quot;, this.value)">' +
            '<option value="">-- No image --</option>' +
            imgOptions +
          '</select>' +
          '<button class="btn-small btn-copy" onclick="copyUrl(&quot;' + fullUrl + '&quot;)">Copy URL</button>' +
        '</div>' +
      '</div>' +
    '</div>';
  }).join('')}
  
  <script>
    function copyUrl(url) {
      navigator.clipboard.writeText(url);
      alert('Copied: ' + url);
    }
    
    async function updateLink(slug, filename) {
      const response = await fetch('/update-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug, filename })
      });
      const result = await response.json();
      if (result.success) {
        location.reload();
      } else {
        alert('Error: ' + result.error);
      }
    }
    
    async function deleteLink(slug) {
      if (!confirm('Delete static link /' + slug + '?')) return;
      const response = await fetch('/delete-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug })
      });
      const result = await response.json();
      if (result.success) {
        location.reload();
      } else {
        alert('Error: ' + result.error);
      }
    }
  </script>
</body>
</html>
    `);
  } catch (err) {
    console.error('Error loading links page:', err);
    res.status(500).send('Error: ' + err.message);
  }
});

// Create static link
app.post('/create-link', async (req, res) => {
  try {
    const slug = req.body.slug.toLowerCase().replace(/[^a-z0-9_-]/g, '');
    const imageFilename = req.body.imageFilename || null;
    
    await pool.query(
      'INSERT INTO static_links (slug, image_filename) VALUES ($1, $2)',
      [slug, imageFilename]
    );
    
    res.redirect('/links');
  } catch (err) {
    console.error('Error creating link:', err);
    res.status(500).send('Error: ' + err.message);
  }
});

// Update static link
app.post('/update-link', async (req, res) => {
  try {
    const { slug, filename } = req.body;
    
    await pool.query(
      'UPDATE static_links SET image_filename = $1 WHERE slug = $2',
      [filename || null, slug]
    );
    
    res.json({ success: true });
  } catch (err) {
    console.error('Error updating link:', err);
    res.json({ success: false, error: err.message });
  }
});

// Delete static link
app.post('/delete-link', async (req, res) => {
  try {
    const { slug } = req.body;
    
    await pool.query('DELETE FROM static_links WHERE slug = $1', [slug]);
    
    res.json({ success: true });
  } catch (err) {
    console.error('Error deleting link:', err);
    res.json({ success: false, error: err.message });
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
