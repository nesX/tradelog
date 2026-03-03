-- Agrega soporte de imagen opcional a backtest_trades
ALTER TABLE backtest_trades
  ADD COLUMN IF NOT EXISTS image_filename VARCHAR(255),
  ADD COLUMN IF NOT EXISTS image_original_name VARCHAR(255),
  ADD COLUMN IF NOT EXISTS image_file_size INTEGER,
  ADD COLUMN IF NOT EXISTS image_mime_type VARCHAR(100);
