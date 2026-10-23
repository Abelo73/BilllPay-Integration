-- Real product photos (Unsplash License), served by the frontend from /products/*.jpg
UPDATE products SET image_url = '/products/' || slug || '.jpg';
