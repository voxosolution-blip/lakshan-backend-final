-- ============================================
-- ADD SALES REVERSE AND EDIT TRACKING
-- This migration adds columns for tracking reversed and edited sales
-- ============================================

-- Add is_reversed column to sales table
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'sales' AND column_name = 'is_reversed') THEN
        ALTER TABLE sales ADD COLUMN is_reversed BOOLEAN DEFAULT false;
        CREATE INDEX IF NOT EXISTS idx_sales_is_reversed ON sales(is_reversed);
    END IF;
END $$;

-- Add reversed tracking columns
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'sales' AND column_name = 'reversed_at') THEN
        ALTER TABLE sales ADD COLUMN reversed_at TIMESTAMP;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'sales' AND column_name = 'reversed_by') THEN
        ALTER TABLE sales ADD COLUMN reversed_by UUID REFERENCES users(id);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'sales' AND column_name = 'reverse_reason') THEN
        ALTER TABLE sales ADD COLUMN reverse_reason TEXT;
    END IF;
END $$;

-- Add is_edited column to sales table
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'sales' AND column_name = 'is_edited') THEN
        ALTER TABLE sales ADD COLUMN is_edited BOOLEAN DEFAULT false;
        CREATE INDEX IF NOT EXISTS idx_sales_is_edited ON sales(is_edited);
    END IF;
END $$;

-- Add edited tracking columns (if needed)
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'sales' AND column_name = 'edited_at') THEN
        ALTER TABLE sales ADD COLUMN edited_at TIMESTAMP;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'sales' AND column_name = 'edited_by') THEN
        ALTER TABLE sales ADD COLUMN edited_by UUID REFERENCES users(id);
    END IF;
END $$;

-- Set default values for existing rows
UPDATE sales SET is_reversed = false WHERE is_reversed IS NULL;
UPDATE sales SET is_edited = false WHERE is_edited IS NULL;

SELECT 'Migration completed: Sales reverse and edit tracking columns added' as status;

