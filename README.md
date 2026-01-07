# Image Editor & Hosting

A simple, self-hosted image hosting and editing service built for Heroku. Perfect for hosting images for digital signage, Proto M displays, or any project requiring persistent image URLs.

## Features

### 📷 Image Upload & Hosting
- Upload images with custom filenames
- Resize images on upload
- Convert between formats (PNG, JPEG, WebP, GIF)
- Direct URL access: `yourapp.herokuapp.com/imagename.png`

### 🔲 Transparent PNG Generator
- Create empty transparent PNGs of any size
- Perfect for "clearing" display fields
- Default size optimized for Proto M (1080×1920)

### 🎬 GIF Creator
- Create GIFs that show an image for X seconds, then disappear
- Single-play (no loop) - perfect for one-time notifications
- Automatic transparent frame at the end

### 🎯 Visual Editor
- Drag-and-drop image positioning
- Multi-layer support with reordering
- Canvas presets for common display sizes (1080×1920, 2160×3840, etc.)
- Output scaling (1x, 2x, 3x, 4x) for high-resolution displays
- Save as PNG or GIF
- Transparent or solid background options

### 🔗 Static Links
- Create permanent URLs that can be reassigned to different images
- Update content without changing the URL
- Perfect for digital signage where URLs are configured once
- Direct integration with the editor

## Tech Stack

- **Backend**: Node.js + Express
- **Database**: PostgreSQL (Heroku Postgres)
- **Image Processing**: Sharp, node-canvas, GIFEncoder-2
- **File Handling**: Multer

## Deployment to Heroku

### Prerequisites
- [Heroku CLI](https://devcenter.heroku.com/articles/heroku-cli) installed
- Heroku account

### Quick Deploy

1. **Clone the repository**
   ```bash
   git clone https://github.com/YOUR_USERNAME/image-editor-hosting.git
   cd image-editor-hosting
   ```

2. **Create Heroku app**
   ```bash
   heroku create your-app-name
   ```

3. **Add PostgreSQL**
   ```bash
   heroku addons:create heroku-postgresql:essential-0
   ```

4. **Deploy**
   ```bash
   git push heroku main
   ```

5. **Open app**
   ```bash
   heroku open
   ```

### Environment Variables

The app automatically uses `DATABASE_URL` provided by Heroku Postgres. No additional configuration required.

## Usage

### Uploading Images
1. Go to the main page (`/`)
2. Choose a file or drag & drop
3. Optionally set custom filename, dimensions, and format
4. Click "Upload Image"
5. Copy the generated URL

### Creating Transparent PNGs
1. Go to `/transparent`
2. Enter filename and dimensions
3. Click "Create Transparent PNG"
4. Use the URL to clear display fields

### Creating GIFs
1. Go to `/gif`
2. Select or upload a source image
3. Set duration (seconds the image shows)
4. Set dimensions
5. Click "Create GIF"

### Using the Editor
1. Go to `/editor`
2. Select canvas size (or use custom dimensions)
3. Add images from the dropdown
4. Drag to position, scroll to resize
5. Use layer controls to reorder/delete
6. Choose output scale (1x-4x)
7. Save as PNG or GIF

### Managing Static Links
1. Go to `/links`
2. Create a new link with a custom slug
3. Assign any image to the link
4. Access via `/links/your-slug`
5. Update the assigned image anytime without changing the URL

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/` | Upload page |
| POST | `/upload` | Upload image |
| GET | `/:filename` | Serve image |
| DELETE | `/delete/:filename` | Delete image |
| GET | `/edit/:filename` | Edit existing image |
| POST | `/edit/:filename` | Save image edits |
| GET | `/transparent` | Transparent PNG generator |
| POST | `/create-transparent` | Create transparent PNG |
| GET | `/gif` | GIF creator page |
| POST | `/create-gif` | Create GIF |
| GET | `/editor` | Visual editor |
| POST | `/save-editor` | Save editor output |
| GET | `/links` | Static links manager |
| POST | `/links` | Create static link |
| GET | `/links/:slug` | Serve linked image |
| POST | `/update-link` | Update link assignment |
| DELETE | `/delete-link/:slug` | Delete static link |

## Proto M Display Notes

This tool was designed with Proto M volumetric displays in mind:

- **Default canvas**: 1080×1920 (9:16 portrait)
- **High-res options**: 2160×3840, 3240×5760
- **Output scaling**: Render at 2x, 3x, or 4x for sharper display
- **GIF behavior**: Single-play GIFs that disappear - perfect for notifications
- **Static links**: Update content remotely without reconfiguring display

## Local Development

```bash
# Install dependencies
npm install

# Set up local PostgreSQL
export DATABASE_URL="postgresql://localhost/imagehosting"

# Run locally
npm start
```

## License

MIT License - feel free to use and modify for your projects.

## Contributing

Pull requests welcome! For major changes, please open an issue first.

