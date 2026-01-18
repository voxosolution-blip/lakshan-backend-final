--
-- PostgreSQL database dump
--

\restrict Ru6wIpyWi6B0x8rfnIZUPazwQ04GQSwxWegYPN9qqll9YkYG2tEa2ZT9UWKCL0u

-- Dumped from database version 16.11
-- Dumped by pg_dump version 16.11

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: uuid-ossp; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA public;


--
-- Name: EXTENSION "uuid-ossp"; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION "uuid-ossp" IS 'generate universally unique identifiers (UUIDs)';


--
-- Name: check_return_price(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.check_return_price() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    IF NEW.is_return = true AND NEW.price != 0 THEN
        RAISE EXCEPTION 'Return items must have price = 0';
    END IF;
    RETURN NEW;
END;
$$;


--
-- Name: generate_batch_number(uuid, date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.generate_batch_number(item_id uuid, prod_date date) RETURNS character varying
    LANGUAGE plpgsql
    AS $_$
DECLARE
    year_part VARCHAR(4);
    date_part VARCHAR(10);
    seq_num INTEGER;
    batch_num VARCHAR(100);
BEGIN
    year_part := TO_CHAR(prod_date, 'YYYY');
    date_part := TO_CHAR(prod_date, 'YYYY-MM-DD');
    
    -- Get the next sequence number for this date and item
    SELECT COALESCE(MAX(CAST(SUBSTRING(batch_number FROM '[0-9]+$') AS INTEGER)), 0) + 1
    INTO seq_num
    FROM inventory_batches
    WHERE inventory_item_id = item_id
    AND production_date = prod_date;
    
    -- Format: YYYY-MM-DD-001, YYYY-MM-DD-002, etc.
    batch_num := date_part || '-' || LPAD(seq_num::TEXT, 3, '0');
    
    RETURN batch_num;
END;
$_$;


--
-- Name: FUNCTION generate_batch_number(item_id uuid, prod_date date); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.generate_batch_number(item_id uuid, prod_date date) IS 'Generates unique batch numbers in format YYYY-MM-DD-XXX';


--
-- Name: update_salesperson_inventory_timestamp(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_salesperson_inventory_timestamp() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$;


--
-- Name: update_updated_at_column(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_updated_at_column() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: buyers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.buyers (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    shop_name character varying(255) NOT NULL,
    contact character varying(20),
    address text,
    is_active boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    latitude numeric(10,8),
    longitude numeric(11,8),
    location_set_at timestamp without time zone
);


--
-- Name: TABLE buyers; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.buyers IS 'Customers/shops that buy products';


--
-- Name: COLUMN buyers.latitude; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.buyers.latitude IS 'Shop location latitude for map display';


--
-- Name: COLUMN buyers.longitude; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.buyers.longitude IS 'Shop location longitude for map display';


--
-- Name: cheques; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cheques (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    payment_id uuid NOT NULL,
    cheque_number character varying(100),
    bank_name character varying(255),
    cheque_date date NOT NULL,
    return_date date,
    amount numeric(10,2) NOT NULL,
    status character varying(50) DEFAULT 'pending'::character varying,
    notes text,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT cheques_amount_check CHECK ((amount > (0)::numeric)),
    CONSTRAINT cheques_status_check CHECK (((status)::text = ANY ((ARRAY['pending'::character varying, 'cleared'::character varying, 'bounced'::character varying, 'cancelled'::character varying])::text[])))
);


--
-- Name: TABLE cheques; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.cheques IS 'Cheque payment details';


--
-- Name: expenses; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.expenses (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    type character varying(100) NOT NULL,
    amount numeric(10,2) NOT NULL,
    date date DEFAULT CURRENT_DATE NOT NULL,
    description text,
    category character varying(100),
    created_by uuid,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT expenses_amount_check CHECK ((amount >= (0)::numeric))
);


--
-- Name: TABLE expenses; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.expenses IS 'Operational expenses';


--
-- Name: farmer_free_products; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.farmer_free_products (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    farmer_id uuid NOT NULL,
    month integer NOT NULL,
    year integer NOT NULL,
    product_id uuid,
    quantity numeric(10,2) NOT NULL,
    unit character varying(50) DEFAULT 'piece'::character varying,
    notes text,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    issued_at timestamp without time zone,
    issued_by uuid,
    CONSTRAINT farmer_free_products_month_check CHECK (((month >= 1) AND (month <= 12))),
    CONSTRAINT farmer_free_products_quantity_check CHECK ((quantity > (0)::numeric))
);


--
-- Name: TABLE farmer_free_products; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.farmer_free_products IS 'Free products given to farmers monthly (reduces inventory)';


--
-- Name: farmers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.farmers (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    name character varying(255) NOT NULL,
    phone character varying(20),
    address text,
    milk_rate numeric(10,2) DEFAULT 0.00,
    allowance numeric(10,2) DEFAULT 0.00,
    is_active boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: TABLE farmers; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.farmers IS 'Milk suppliers/farmers';


--
-- Name: inventory_batches; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.inventory_batches (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    inventory_item_id uuid NOT NULL,
    production_id uuid,
    batch_number character varying(100) NOT NULL,
    quantity numeric(10,2) NOT NULL,
    production_date date NOT NULL,
    expiry_date date,
    status character varying(50) DEFAULT 'available'::character varying,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT inventory_batches_quantity_check CHECK ((quantity > (0)::numeric)),
    CONSTRAINT inventory_batches_status_check CHECK (((status)::text = ANY ((ARRAY['available'::character varying, 'allocated'::character varying, 'sold'::character varying, 'expired'::character varying])::text[])))
);


--
-- Name: TABLE inventory_batches; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.inventory_batches IS 'Tracks finished goods inventory with batch numbers for traceability';


--
-- Name: inventory_categories; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.inventory_categories (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    name character varying(100) NOT NULL,
    description text,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: inventory_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.inventory_items (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    name character varying(255) NOT NULL,
    category_id uuid NOT NULL,
    unit character varying(50) DEFAULT 'liter'::character varying NOT NULL,
    quantity numeric(10,2) DEFAULT 0.00,
    min_quantity numeric(10,2) DEFAULT 0.00,
    expiry_date date,
    price numeric(10,2) DEFAULT 0.00,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT inventory_items_quantity_check CHECK ((quantity >= (0)::numeric))
);


--
-- Name: TABLE inventory_items; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.inventory_items IS 'All inventory items (raw materials, packaging, finished goods)';


--
-- Name: milk_collections; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.milk_collections (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    farmer_id uuid NOT NULL,
    date date DEFAULT CURRENT_DATE NOT NULL,
    "time" time without time zone DEFAULT CURRENT_TIME,
    quantity_liters numeric(10,2) NOT NULL,
    notes text,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT milk_collections_quantity_liters_check CHECK ((quantity_liters > (0)::numeric))
);


--
-- Name: TABLE milk_collections; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.milk_collections IS 'Daily milk collection records - auto-adds to inventory';


--
-- Name: payment_free_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.payment_free_items (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    payment_id uuid NOT NULL,
    product_id uuid NOT NULL,
    quantity numeric(10,2) NOT NULL,
    created_by uuid,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT payment_free_items_quantity_check CHECK ((quantity > (0)::numeric))
);


--
-- Name: payments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.payments (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    sale_id uuid NOT NULL,
    cash_amount numeric(10,2) DEFAULT 0.00,
    cheque_amount numeric(10,2) DEFAULT 0.00,
    status character varying(50) DEFAULT 'pending'::character varying,
    payment_date date DEFAULT CURRENT_DATE,
    notes text,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    ongoing_amount numeric(10,2) DEFAULT 0.00,
    total_amount numeric(10,2) GENERATED ALWAYS AS (((cash_amount + cheque_amount) + ongoing_amount)) STORED,
    CONSTRAINT payments_cash_amount_check CHECK ((cash_amount >= (0)::numeric)),
    CONSTRAINT payments_cheque_amount_check CHECK ((cheque_amount >= (0)::numeric)),
    CONSTRAINT payments_ongoing_amount_check CHECK ((ongoing_amount >= (0)::numeric)),
    CONSTRAINT payments_status_check CHECK (((status)::text = ANY ((ARRAY['pending'::character varying, 'completed'::character varying, 'cancelled'::character varying])::text[])))
);


--
-- Name: TABLE payments; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.payments IS 'Payment records for sales';


--
-- Name: payroll; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.payroll (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    worker_id uuid NOT NULL,
    month integer NOT NULL,
    year integer NOT NULL,
    days_present integer DEFAULT 0,
    main_salary numeric(10,2) DEFAULT 0.00,
    monthly_bonus numeric(10,2) DEFAULT 0.00,
    advance_amount numeric(10,2) DEFAULT 0.00,
    net_pay numeric(10,2) DEFAULT 0.00,
    payment_date date,
    payment_status character varying(20) DEFAULT 'pending'::character varying,
    notes text,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    created_by uuid,
    daily_salary numeric(10,2) DEFAULT 0.00,
    working_days integer DEFAULT 0,
    gross_salary numeric(10,2) DEFAULT 0.00,
    epf_amount numeric(10,2) DEFAULT 0.00,
    etf_amount numeric(10,2) DEFAULT 0.00,
    total_deductions numeric(10,2) DEFAULT 0.00,
    late_bonus numeric(10,2) DEFAULT 0.00,
    CONSTRAINT worker_salary_payments_month_check CHECK (((month >= 1) AND (month <= 12))),
    CONSTRAINT worker_salary_payments_payment_status_check CHECK (((payment_status)::text = ANY ((ARRAY['pending'::character varying, 'paid'::character varying, 'partial'::character varying])::text[])))
);


--
-- Name: TABLE payroll; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.payroll IS 'Monthly payroll records with calculated salaries and deductions';


--
-- Name: COLUMN payroll.late_bonus; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.payroll.late_bonus IS 'Late hour bonus for the month';


--
-- Name: product_bom; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.product_bom (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    product_id uuid NOT NULL,
    inventory_item_id uuid NOT NULL,
    quantity_required numeric(10,2) NOT NULL,
    unit character varying(50) NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT product_bom_quantity_required_check CHECK ((quantity_required > (0)::numeric))
);


--
-- Name: TABLE product_bom; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.product_bom IS 'Bill of Materials - recipe for each product';


--
-- Name: productions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.productions (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    date date DEFAULT CURRENT_DATE NOT NULL,
    product_id uuid NOT NULL,
    quantity_produced numeric(10,2) NOT NULL,
    notes text,
    created_by uuid,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    batch character varying(50),
    CONSTRAINT productions_quantity_produced_check CHECK ((quantity_produced > (0)::numeric))
);


--
-- Name: TABLE productions; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.productions IS 'Production records - auto-deducts inventory, adds finished goods';


--
-- Name: products; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.products (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    name character varying(255) NOT NULL,
    category character varying(100),
    selling_price numeric(10,2) NOT NULL,
    is_active boolean DEFAULT true,
    description text,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT products_selling_price_check CHECK ((selling_price >= (0)::numeric))
);


--
-- Name: TABLE products; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.products IS 'Finished products for sale';


--
-- Name: returns; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.returns (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    sale_id uuid NOT NULL,
    product_id uuid NOT NULL,
    quantity numeric(10,2) NOT NULL,
    reason text,
    replacement_given boolean DEFAULT false,
    replacement_product_id uuid,
    replacement_quantity numeric(10,2),
    processed_by uuid,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT returns_quantity_check CHECK ((quantity > (0)::numeric))
);


--
-- Name: TABLE returns; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.returns IS 'Product returns and replacements';


--
-- Name: salary_bonus; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.salary_bonus (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    worker_id uuid NOT NULL,
    month integer NOT NULL,
    year integer NOT NULL,
    monthly_bonus numeric(10,2) DEFAULT 0.00,
    late_bonus numeric(10,2) DEFAULT 0.00,
    notes text,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT salary_bonus_month_check CHECK (((month >= 1) AND (month <= 12)))
);


--
-- Name: TABLE salary_bonus; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.salary_bonus IS 'Monthly bonus and late hour bonus per worker';


--
-- Name: sale_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sale_items (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    sale_id uuid NOT NULL,
    product_id uuid NOT NULL,
    quantity numeric(10,2) NOT NULL,
    price numeric(10,2) NOT NULL,
    subtotal numeric(10,2) GENERATED ALWAYS AS ((quantity * price)) STORED,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    is_return boolean DEFAULT false,
    CONSTRAINT sale_items_price_check CHECK ((price >= (0)::numeric)),
    CONSTRAINT sale_items_quantity_check CHECK ((((is_return = false) AND (quantity > (0)::numeric)) OR ((is_return = true) AND (quantity > (0)::numeric))))
);


--
-- Name: sales; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sales (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    buyer_id uuid,
    salesperson_id uuid,
    date date DEFAULT CURRENT_DATE NOT NULL,
    total_amount numeric(10,2) DEFAULT 0.00 NOT NULL,
    payment_status character varying(50) DEFAULT 'pending'::character varying,
    notes text,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    sold_by character varying(20) DEFAULT 'SALESPERSON'::character varying,
    CONSTRAINT sales_payment_status_check CHECK (((payment_status)::text = ANY ((ARRAY['pending'::character varying, 'partial'::character varying, 'paid'::character varying])::text[]))),
    CONSTRAINT sales_sold_by_check CHECK (((sold_by)::text = ANY ((ARRAY['ADMIN'::character varying, 'SALESPERSON'::character varying])::text[]))),
    CONSTRAINT sales_total_amount_check CHECK ((total_amount >= (0)::numeric))
);


--
-- Name: TABLE sales; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.sales IS 'Sales transactions';


--
-- Name: COLUMN sales.sold_by; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.sales.sold_by IS 'Track if sale was made by ADMIN (direct sales) or SALESPERSON (from allocated stock)';


--
-- Name: sales_allocations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sales_allocations (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    production_id uuid NOT NULL,
    product_id uuid NOT NULL,
    quantity_allocated numeric(10,2) NOT NULL,
    allocated_to uuid,
    allocation_date date DEFAULT CURRENT_DATE NOT NULL,
    status character varying(50) DEFAULT 'allocated'::character varying,
    notes text,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT sales_allocations_quantity_allocated_check CHECK ((quantity_allocated > (0)::numeric)),
    CONSTRAINT sales_allocations_status_check CHECK (((status)::text = ANY ((ARRAY['allocated'::character varying, 'sold'::character varying, 'returned'::character varying])::text[])))
);


--
-- Name: TABLE sales_allocations; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.sales_allocations IS 'Track product allocation from production to sales persons';


--
-- Name: salesperson_allocations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.salesperson_allocations (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    production_id uuid NOT NULL,
    product_id uuid NOT NULL,
    salesperson_id uuid NOT NULL,
    batch_number character varying(100) NOT NULL,
    quantity_allocated numeric(10,2) NOT NULL,
    allocation_date date DEFAULT CURRENT_DATE NOT NULL,
    status character varying(50) DEFAULT 'active'::character varying,
    notes text,
    allocated_by uuid,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT salesperson_allocations_quantity_allocated_check CHECK ((quantity_allocated > (0)::numeric)),
    CONSTRAINT salesperson_allocations_status_check CHECK (((status)::text = ANY ((ARRAY['active'::character varying, 'completed'::character varying, 'returned'::character varying, 'cancelled'::character varying])::text[])))
);


--
-- Name: TABLE salesperson_allocations; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.salesperson_allocations IS 'Tracks products allocated to salespersons from daily production';


--
-- Name: salesperson_inventory; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.salesperson_inventory (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    salesperson_id uuid NOT NULL,
    product_id uuid NOT NULL,
    allocated_quantity numeric(10,2) DEFAULT 0 NOT NULL,
    available_quantity numeric(10,2) DEFAULT 0 NOT NULL,
    allocated_by uuid,
    allocated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT salesperson_inventory_allocated_quantity_check CHECK ((allocated_quantity >= (0)::numeric)),
    CONSTRAINT salesperson_inventory_available_quantity_check CHECK ((available_quantity >= (0)::numeric))
);


--
-- Name: TABLE salesperson_inventory; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.salesperson_inventory IS 'Product inventory allocated to each salesperson by admin';


--
-- Name: salesperson_locations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.salesperson_locations (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    user_id uuid NOT NULL,
    latitude numeric(10,8) NOT NULL,
    longitude numeric(11,8) NOT NULL,
    accuracy numeric(10,2),
    last_updated timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    status character varying(20) DEFAULT 'online'::character varying,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT salesperson_locations_status_check CHECK (((status)::text = ANY ((ARRAY['online'::character varying, 'offline'::character varying])::text[])))
);


--
-- Name: TABLE salesperson_locations; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.salesperson_locations IS 'Real-time location tracking for salespersons';


--
-- Name: settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.settings (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    key character varying(100) NOT NULL,
    value text NOT NULL,
    description text,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_by uuid
);


--
-- Name: TABLE settings; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.settings IS 'System settings and configuration values';


--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    name character varying(255) NOT NULL,
    email character varying(255),
    username character varying(100) NOT NULL,
    password_hash character varying(255) NOT NULL,
    role character varying(50) DEFAULT 'SALESPERSON'::character varying NOT NULL,
    is_active boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT users_role_check CHECK (((role)::text = ANY ((ARRAY['ADMIN'::character varying, 'SALESPERSON'::character varying, 'ACCOUNTANT'::character varying, 'PRODUCTION'::character varying])::text[])))
);


--
-- Name: TABLE users; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.users IS 'System users with role-based access';


--
-- Name: v_daily_production_summary; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.v_daily_production_summary AS
 SELECT p.id AS production_id,
    p.date AS production_date,
    p.batch,
    pr.id AS product_id,
    pr.name AS product_name,
    p.quantity_produced,
    COALESCE(sum(sa.quantity_allocated), (0)::numeric) AS total_allocated,
    (p.quantity_produced - COALESCE(sum(sa.quantity_allocated), (0)::numeric)) AS remaining_quantity,
    count(DISTINCT sa.salesperson_id) AS salesperson_count
   FROM ((public.productions p
     JOIN public.products pr ON ((p.product_id = pr.id)))
     LEFT JOIN public.salesperson_allocations sa ON (((p.id = sa.production_id) AND ((sa.status)::text = 'active'::text))))
  GROUP BY p.id, p.date, p.batch, pr.id, pr.name, p.quantity_produced;


--
-- Name: v_daily_sales_summary; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.v_daily_sales_summary AS
 SELECT date,
    count(DISTINCT id) AS total_sales,
    count(DISTINCT buyer_id) AS unique_buyers,
    sum(total_amount) AS total_revenue,
    sum(
        CASE
            WHEN ((payment_status)::text = 'paid'::text) THEN total_amount
            ELSE (0)::numeric
        END) AS paid_amount,
    sum(
        CASE
            WHEN ((payment_status)::text = 'pending'::text) THEN total_amount
            ELSE (0)::numeric
        END) AS pending_amount
   FROM public.sales s
  GROUP BY date;


--
-- Name: v_expiry_alerts; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.v_expiry_alerts AS
 SELECT i.id,
    i.name,
    i.category_id,
    c.name AS category_name,
    i.quantity,
    i.expiry_date,
    (i.expiry_date - CURRENT_DATE) AS days_until_expiry
   FROM (public.inventory_items i
     JOIN public.inventory_categories c ON ((i.category_id = c.id)))
  WHERE ((i.expiry_date IS NOT NULL) AND (i.expiry_date >= CURRENT_DATE) AND (i.expiry_date <= (CURRENT_DATE + '7 days'::interval)));


--
-- Name: v_low_stock_alerts; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.v_low_stock_alerts AS
 SELECT i.id,
    i.name,
    i.category_id,
    c.name AS category_name,
    i.quantity,
    i.min_quantity,
    i.unit,
    (i.min_quantity - i.quantity) AS shortage
   FROM (public.inventory_items i
     JOIN public.inventory_categories c ON ((i.category_id = c.id)))
  WHERE ((i.quantity < i.min_quantity) AND (i.min_quantity > (0)::numeric));


--
-- Name: v_report_cheques_details; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.v_report_cheques_details AS
 SELECT c.id AS cheque_id,
    c.payment_id,
    p.sale_id,
    ('INV-'::text || "substring"((p.sale_id)::text, 1, 8)) AS invoice_no,
    b.shop_name AS customer_name,
    c.cheque_number,
    c.bank_name,
    c.cheque_date,
    c.return_date,
    c.amount,
    c.status AS cheque_status,
    c.notes,
    c.created_at,
    c.updated_at
   FROM (((public.cheques c
     JOIN public.payments p ON ((p.id = c.payment_id)))
     LEFT JOIN public.sales s ON ((s.id = p.sale_id)))
     LEFT JOIN public.buyers b ON ((b.id = s.buyer_id)));


--
-- Name: v_report_expenses_details; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.v_report_expenses_details AS
 SELECT e.id AS expense_id,
    e.date,
    e.type,
    e.category,
    e.description,
    e.amount,
    e.created_by,
    u.name AS created_by_name,
    e.created_at,
    e.updated_at
   FROM (public.expenses e
     LEFT JOIN public.users u ON ((u.id = e.created_by)));


--
-- Name: v_report_inventory_snapshot; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.v_report_inventory_snapshot AS
 SELECT i.id AS inventory_item_id,
    i.name AS item_name,
    c.name AS category_name,
    i.unit,
    (i.quantity)::numeric(12,2) AS current_stock,
    (i.min_quantity)::numeric(12,2) AS min_stock_level,
    (i.price)::numeric(12,2) AS unit_price,
    ((i.quantity * COALESCE(i.price, (0)::numeric)))::numeric(12,2) AS stock_value,
    i.expiry_date,
    ((i.expiry_date IS NOT NULL) AND (i.expiry_date <= (CURRENT_DATE + '7 days'::interval))) AS expiring_soon,
    (i.quantity <= COALESCE(i.min_quantity, (0)::numeric)) AS low_stock
   FROM (public.inventory_items i
     LEFT JOIN public.inventory_categories c ON ((c.id = i.category_id)));


--
-- Name: v_setting_milk_price; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.v_setting_milk_price AS
 SELECT COALESCE(( SELECT (settings.value)::numeric AS value
           FROM public.settings
          WHERE ((settings.key)::text = 'milk_price_per_liter'::text)
         LIMIT 1), (200)::numeric) AS milk_price_per_liter;


--
-- Name: v_report_milk_collection_details; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.v_report_milk_collection_details AS
 SELECT mc.id,
    mc.date,
    mc."time",
    mc.farmer_id,
    f.name AS farmer_name,
    mc.quantity_liters,
    (COALESCE(NULLIF(f.milk_rate, (0)::numeric), ( SELECT v_setting_milk_price.milk_price_per_liter
           FROM public.v_setting_milk_price)))::numeric(10,2) AS rate_per_liter,
    ((mc.quantity_liters * COALESCE(NULLIF(f.milk_rate, (0)::numeric), ( SELECT v_setting_milk_price.milk_price_per_liter
           FROM public.v_setting_milk_price))))::numeric(12,2) AS amount,
    mc.notes,
    mc.created_at,
    mc.updated_at
   FROM (public.milk_collections mc
     JOIN public.farmers f ON ((f.id = mc.farmer_id)));


--
-- Name: v_report_payments_details; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.v_report_payments_details AS
 SELECT p.id AS payment_id,
    p.payment_date,
    p.status AS payment_status,
    p.sale_id,
    ('INV-'::text || "substring"((p.sale_id)::text, 1, 8)) AS invoice_no,
    s.date AS sale_date,
    s.buyer_id,
    b.shop_name AS customer_name,
    p.cash_amount,
    p.cheque_amount,
    p.total_amount,
        CASE
            WHEN ((p.cash_amount > (0)::numeric) AND (p.cheque_amount > (0)::numeric)) THEN 'CASH+CHEQUE'::text
            WHEN (p.cheque_amount > (0)::numeric) THEN 'CHEQUE'::text
            WHEN (p.cash_amount > (0)::numeric) THEN 'CASH'::text
            ELSE 'N/A'::text
        END AS payment_type,
    p.notes,
    p.created_at,
    p.updated_at
   FROM ((public.payments p
     LEFT JOIN public.sales s ON ((s.id = p.sale_id)))
     LEFT JOIN public.buyers b ON ((b.id = s.buyer_id)));


--
-- Name: workers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.workers (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    name character varying(255) NOT NULL,
    phone character varying(20),
    address text,
    epf_number character varying(50),
    etf_number character varying(50),
    main_salary numeric(10,2) DEFAULT 0.00 NOT NULL,
    monthly_bonus numeric(10,2) DEFAULT 0.00,
    late_hour_rate numeric(10,2) DEFAULT 0.00,
    is_active boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    daily_salary numeric(10,2) DEFAULT 0.00,
    epf_percentage numeric(5,2) DEFAULT 8.00,
    etf_percentage numeric(5,2) DEFAULT 3.00,
    job_role character varying(100)
);


--
-- Name: TABLE workers; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.workers IS 'Worker/Employee master data with daily salary and EPF/ETF percentages';


--
-- Name: v_report_payroll_details; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.v_report_payroll_details AS
 SELECT pr.id AS payroll_id,
    pr.worker_id,
    w.name AS worker_name,
    pr.month,
    pr.year,
    pr.daily_salary,
    pr.working_days,
    pr.main_salary,
    pr.monthly_bonus,
    pr.late_bonus,
    pr.advance_amount,
    pr.epf_amount,
    pr.etf_amount,
    pr.gross_salary,
    pr.total_deductions,
    pr.net_pay,
    pr.created_at,
    pr.updated_at
   FROM (public.payroll pr
     JOIN public.workers w ON ((w.id = pr.worker_id)));


--
-- Name: v_report_production_details; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.v_report_production_details AS
 SELECT p.id AS production_id,
    p.date AS production_date,
    p.product_id,
    pr.name AS product_name,
    p.quantity_produced,
    p.batch,
    p.notes,
    p.created_by,
    u.name AS created_by_name,
    (COALESCE(( SELECT sum(((pb.quantity_required * p.quantity_produced) * COALESCE(ii.price, (0)::numeric))) AS sum
           FROM (public.product_bom pb
             JOIN public.inventory_items ii ON ((ii.id = pb.inventory_item_id)))
          WHERE (pb.product_id = p.product_id)), (0)::numeric))::numeric(12,2) AS production_cost_estimated,
    p.created_at,
    p.updated_at
   FROM ((public.productions p
     JOIN public.products pr ON ((pr.id = p.product_id)))
     LEFT JOIN public.users u ON ((u.id = p.created_by)));


--
-- Name: v_report_returns_details; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.v_report_returns_details AS
 SELECT r.id AS return_id,
    (r.created_at)::date AS return_date,
    r.sale_id,
    ('INV-'::text || "substring"((r.sale_id)::text, 1, 8)) AS invoice_no,
    s.buyer_id,
    b.shop_name AS customer_name,
    r.product_id,
    p.name AS product_name,
    r.quantity,
    COALESCE(si.price, p.selling_price) AS unit_price_ref,
    ((r.quantity * COALESCE(si.price, p.selling_price)))::numeric(12,2) AS return_amount_estimated,
    r.reason,
    r.replacement_given,
    r.replacement_product_id,
    rp.name AS replacement_product_name,
    r.replacement_quantity,
    r.processed_by,
    u.name AS processed_by_name
   FROM ((((((public.returns r
     LEFT JOIN public.sales s ON ((s.id = r.sale_id)))
     LEFT JOIN public.buyers b ON ((b.id = s.buyer_id)))
     LEFT JOIN public.products p ON ((p.id = r.product_id)))
     LEFT JOIN public.products rp ON ((rp.id = r.replacement_product_id)))
     LEFT JOIN public.users u ON ((u.id = r.processed_by)))
     LEFT JOIN public.sale_items si ON (((si.sale_id = r.sale_id) AND (si.product_id = r.product_id))));


--
-- Name: v_report_sales_details; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.v_report_sales_details AS
 WITH payment_totals AS (
         SELECT p.sale_id,
            (COALESCE(sum(p.cash_amount), (0)::numeric))::numeric(12,2) AS cash_amount,
            (COALESCE(sum(p.cheque_amount), (0)::numeric))::numeric(12,2) AS cheque_amount,
            (COALESCE(sum(p.total_amount), (0)::numeric))::numeric(12,2) AS paid_amount
           FROM public.payments p
          WHERE ((p.status)::text <> 'cancelled'::text)
          GROUP BY p.sale_id
        )
 SELECT s.id AS sale_id,
    ('INV-'::text || "substring"((s.id)::text, 1, 8)) AS invoice_no,
    s.date,
    s.salesperson_id,
    u.name AS salesperson_name,
    s.buyer_id,
    b.shop_name AS customer_name,
    s.payment_status,
    si.id AS sale_item_id,
    si.product_id,
    pr.name AS product_name,
    si.quantity,
    si.price AS unit_price,
    si.subtotal AS line_amount,
    s.total_amount AS invoice_total,
    COALESCE(pt.cash_amount, (0)::numeric) AS cash_paid,
    COALESCE(pt.cheque_amount, (0)::numeric) AS cheque_paid,
    COALESCE(pt.paid_amount, (0)::numeric) AS total_paid,
    (GREATEST((0)::numeric, (s.total_amount - COALESCE(pt.paid_amount, (0)::numeric))))::numeric(12,2) AS outstanding,
        CASE
            WHEN ((COALESCE(pt.cash_amount, (0)::numeric) > (0)::numeric) AND (COALESCE(pt.cheque_amount, (0)::numeric) > (0)::numeric)) THEN 'CASH+CHEQUE'::text
            WHEN (COALESCE(pt.cheque_amount, (0)::numeric) > (0)::numeric) THEN 'CHEQUE'::text
            WHEN (COALESCE(pt.cash_amount, (0)::numeric) > (0)::numeric) THEN 'CASH'::text
            ELSE 'N/A'::text
        END AS payment_type,
    s.notes,
    s.created_at,
    s.updated_at
   FROM (((((public.sales s
     LEFT JOIN public.buyers b ON ((b.id = s.buyer_id)))
     LEFT JOIN public.users u ON ((u.id = s.salesperson_id)))
     JOIN public.sale_items si ON ((si.sale_id = s.id)))
     JOIN public.products pr ON ((pr.id = si.product_id)))
     LEFT JOIN payment_totals pt ON ((pt.sale_id = s.id)));


--
-- Name: v_salesperson_dashboard; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.v_salesperson_dashboard AS
 SELECT u.id AS salesperson_id,
    u.name AS salesperson_name,
    sl.latitude,
    sl.longitude,
    sl.status,
    COALESCE(sl.updated_at, sl.last_updated) AS last_location_update,
    count(DISTINCT s.id) AS total_sales_today,
    COALESCE(sum(s.total_amount), (0)::numeric) AS total_revenue_today,
    count(DISTINCT s.buyer_id) AS unique_shops_today
   FROM ((public.users u
     LEFT JOIN public.salesperson_locations sl ON ((u.id = sl.user_id)))
     LEFT JOIN public.sales s ON (((u.id = s.salesperson_id) AND (s.date = CURRENT_DATE))))
  WHERE (((u.role)::text = 'SALESPERSON'::text) AND (u.is_active = true))
  GROUP BY u.id, u.name, sl.latitude, sl.longitude, sl.status, sl.updated_at, sl.last_updated;


--
-- Name: VIEW v_salesperson_dashboard; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON VIEW public.v_salesperson_dashboard IS 'Dashboard metrics for each salesperson including location and today sales';


--
-- Name: v_salesperson_inventory; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.v_salesperson_inventory AS
 SELECT sa.id AS allocation_id,
    sa.salesperson_id,
    u.name AS salesperson_name,
    sa.product_id,
    pr.name AS product_name,
    sa.batch_number,
    sa.quantity_allocated,
    sa.allocation_date,
    sa.status,
    p.date AS production_date,
    p.batch AS production_batch
   FROM (((public.salesperson_allocations sa
     JOIN public.users u ON ((sa.salesperson_id = u.id)))
     JOIN public.products pr ON ((sa.product_id = pr.id)))
     JOIN public.productions p ON ((sa.production_id = p.id)))
  WHERE ((sa.status)::text = 'active'::text);


--
-- Name: v_shop_pending_balances; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.v_shop_pending_balances AS
 SELECT b.id AS shop_id,
    b.shop_name,
    b.contact,
    b.address,
    b.latitude,
    b.longitude,
    COALESCE(sum(p.ongoing_amount), (0)::numeric) AS total_ongoing,
    COALESCE(sum(
        CASE
            WHEN ((c.status)::text = 'pending'::text) THEN c.amount
            ELSE (0)::numeric
        END), (0)::numeric) AS total_pending_cheques,
    count(DISTINCT
        CASE
            WHEN ((c.status)::text = 'pending'::text) THEN c.id
            ELSE NULL::uuid
        END) AS pending_cheque_count,
    max(c.cheque_date) AS latest_cheque_date
   FROM (((public.buyers b
     LEFT JOIN public.sales s ON ((b.id = s.buyer_id)))
     LEFT JOIN public.payments p ON ((s.id = p.sale_id)))
     LEFT JOIN public.cheques c ON ((p.id = c.payment_id)))
  WHERE (b.is_active = true)
  GROUP BY b.id, b.shop_name, b.contact, b.address, b.latitude, b.longitude;


--
-- Name: VIEW v_shop_pending_balances; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON VIEW public.v_shop_pending_balances IS 'Shows pending payments (ongoing credit + pending cheques) for each shop';


--
-- Name: worker_advances; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.worker_advances (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    worker_id uuid NOT NULL,
    month integer NOT NULL,
    year integer NOT NULL,
    amount numeric(10,2) NOT NULL,
    payment_date date DEFAULT CURRENT_DATE NOT NULL,
    notes text,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    "time" time without time zone DEFAULT CURRENT_TIME,
    CONSTRAINT worker_advances_amount_check CHECK ((amount > (0)::numeric)),
    CONSTRAINT worker_advances_month_check CHECK (((month >= 1) AND (month <= 12)))
);


--
-- Name: TABLE worker_advances; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.worker_advances IS 'Advance salary payments (deducted from monthly salary)';


--
-- Name: worker_attendance; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.worker_attendance (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    worker_id uuid NOT NULL,
    date date DEFAULT CURRENT_DATE NOT NULL,
    present boolean DEFAULT true,
    late_hours numeric(4,2) DEFAULT 0.00,
    notes text,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: TABLE worker_attendance; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.worker_attendance IS 'Daily attendance tracking for workers';


--
-- Name: worker_free_products; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.worker_free_products (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    worker_id uuid NOT NULL,
    month integer NOT NULL,
    year integer NOT NULL,
    inventory_item_id uuid,
    product_id uuid,
    quantity numeric(10,2) NOT NULL,
    unit character varying(50) DEFAULT 'piece'::character varying,
    notes text,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    issued_at timestamp without time zone,
    issued_by uuid,
    CONSTRAINT worker_free_products_check CHECK ((((inventory_item_id IS NOT NULL) AND (product_id IS NULL)) OR ((inventory_item_id IS NULL) AND (product_id IS NOT NULL)))),
    CONSTRAINT worker_free_products_month_check CHECK (((month >= 1) AND (month <= 12))),
    CONSTRAINT worker_free_products_quantity_check CHECK ((quantity > (0)::numeric))
);


--
-- Name: TABLE worker_free_products; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.worker_free_products IS 'Free products given to workers monthly (reduces inventory)';


--
-- Name: worker_salary_payments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.worker_salary_payments (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    worker_id uuid NOT NULL,
    month integer NOT NULL,
    year integer NOT NULL,
    days_present integer DEFAULT 0,
    main_salary numeric(10,2) DEFAULT 0.00,
    monthly_bonus numeric(10,2) DEFAULT 0.00,
    late_hour_salary numeric(10,2) DEFAULT 0.00,
    advance_amount numeric(10,2) DEFAULT 0.00,
    net_pay numeric(10,2) DEFAULT 0.00,
    payment_date date,
    payment_status character varying(20) DEFAULT 'pending'::character varying,
    notes text,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    created_by uuid,
    CONSTRAINT worker_salary_payments_month_check1 CHECK (((month >= 1) AND (month <= 12))),
    CONSTRAINT worker_salary_payments_payment_status_check1 CHECK (((payment_status)::text = ANY ((ARRAY['pending'::character varying, 'paid'::character varying, 'partial'::character varying])::text[])))
);


--
-- Name: TABLE worker_salary_payments; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.worker_salary_payments IS 'Monthly salary payment records for workers';


--
-- Data for Name: buyers; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.buyers (id, shop_name, contact, address, is_active, created_at, updated_at, latitude, longitude, location_set_at) FROM stdin;
06aea30e-9de5-49ad-b863-ce1985c336bc	kanchana stores	0710258963	mahanama road , monaragaala	t	2026-01-08 14:18:10.539777	2026-01-08 14:18:10.539777	\N	\N	\N
7a93cbd9-87c0-46af-b36f-37da4015d416	abc	0712548963	hhhh	t	2026-01-09 05:31:03.923435	2026-01-09 05:31:03.923435	\N	\N	\N
8b117a30-b9f2-439c-bdca-9afbcfeadeed	sasas	\N	\N	t	2026-01-09 10:22:48.966459	2026-01-09 10:22:48.966459	\N	\N	\N
4bb1a2b8-df7d-4f9d-85b6-db2723d5e8c5	ddd	\N	\N	t	2026-01-09 10:29:03.341584	2026-01-09 10:29:03.341584	\N	\N	\N
fccfd4af-f608-41be-be2d-985a0197836c	ABS	0715897895	no50 , jjsjsjsjs,nana	t	2026-01-10 04:25:32.141717	2026-01-10 04:25:32.141717	\N	\N	\N
42097b71-8080-4a40-b735-2f459d9ab375	lakshan	888888	fffffg	t	2026-01-11 14:03:08.015525	2026-01-11 14:03:08.015525	\N	\N	\N
76808d64-f034-46f2-badc-b951662d0084	lakshan	888888	fffffg	t	2026-01-11 14:03:08.997649	2026-01-11 14:03:08.997649	\N	\N	\N
84c14521-744e-46d2-9d02-8c57e88dfbb3	lakshan	888888	fffffg	t	2026-01-11 14:03:10.030363	2026-01-11 14:03:10.030363	\N	\N	\N
bead7fa8-4bb1-4411-b96d-62692221defa	warshop	0715689745	sasasasasa	f	2026-01-10 04:02:05.850277	2026-01-13 12:19:47.104195	6.87058000	81.34839600	2026-01-10 09:32:05.839
b752b76a-834f-4533-8ef6-cefa50eaf6da	Location test location	0710504598	this is for the test the location access of the shop	t	2026-01-13 12:25:12.394429	2026-01-13 12:25:12.394429	\N	\N	\N
a3adf1f4-4e97-489a-8504-a2b74ff4961a	Location testing shop	0714586248	this is for the location service checking	t	2026-01-13 12:29:37.349393	2026-01-13 12:29:37.349393	\N	\N	\N
a2e78182-1e0b-4600-a1ba-128b0d9ffdcd	Location test 02	0758964125	location check 02	t	2026-01-13 12:36:11.804669	2026-01-13 12:36:11.804669	\N	\N	\N
f1927a80-d3db-4135-98b4-d942e77d6d2b	123store	07145866588	hhhhhh88iojjjj	f	2026-01-09 18:28:50.472922	2026-01-13 12:36:25.402179	6.92707860	79.86124300	2026-01-09 23:58:50.46
9d15302c-c8db-4567-8e6f-9af102b0fa06	test location 3	078556612	location 3	t	2026-01-13 12:49:14.910476	2026-01-13 12:49:14.910476	6.87507010	81.34889221	\N
\.


--
-- Data for Name: cheques; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.cheques (id, payment_id, cheque_number, bank_name, cheque_date, return_date, amount, status, notes, created_at, updated_at) FROM stdin;
1d832a9e-fbab-48fb-acf5-fb1a3752cfa4	df46b213-64be-4d19-9a33-6093c30dc47e	99999	jjjj	2026-01-09	2026-01-15	1000.00	cleared	From Salesperson Mobile	2026-01-09 18:31:26.992832	2026-01-10 03:50:29.435949
d10a7f27-192e-4d91-9682-5ec61b6d685c	42dfcd1a-54ff-4879-b7ce-c28f925f0891	112233445566778899	boc	2026-01-31	\N	500.00	cleared	\N	2026-01-09 17:43:23.166433	2026-01-10 03:50:31.944623
f11f7818-f1a4-48fc-befe-f00d0a47c205	8b4431a7-88c6-4d5c-968d-52f56a5bc0b7	9999999999b	hhh	2026-01-10	2026-01-12	1000.00	cleared	From Salesperson Mobile	2026-01-10 04:12:27.507112	2026-01-13 16:41:04.131266
\.


--
-- Data for Name: expenses; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.expenses (id, type, amount, date, description, category, created_by, created_at, updated_at) FROM stdin;
f8704854-46bb-4ecc-8082-bb1deae3f8c7	operational	500.00	2026-01-06	fuel	Transport	5da64e83-1413-4d59-b6f9-772f09242a79	2026-01-06 07:31:49.497457	2026-01-06 07:31:49.497457
\.


--
-- Data for Name: farmer_free_products; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.farmer_free_products (id, farmer_id, month, year, product_id, quantity, unit, notes, created_at, updated_at, issued_at, issued_by) FROM stdin;
6787fc51-6425-4fd9-87fc-dcf52a9b06c8	a52afdee-ed01-4589-9760-e1513d502681	1	2026	96191b15-5b8a-4ff5-8a87-e56e64980bda	10.00	piece	\N	2026-01-15 04:40:37.243731	2026-01-15 04:40:37.243731	2026-01-15 04:40:37.243731	5da64e83-1413-4d59-b6f9-772f09242a79
9afbe229-f6a5-4fa1-b880-d3bdf1f3bfd7	3b33da29-27d4-43fa-a18f-63565f312397	1	2026	96191b15-5b8a-4ff5-8a87-e56e64980bda	10.00	piece	\N	2026-01-15 04:42:14.727999	2026-01-15 04:42:14.727999	2026-01-15 04:42:14.727999	5da64e83-1413-4d59-b6f9-772f09242a79
\.


--
-- Data for Name: farmers; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.farmers (id, name, phone, address, milk_rate, allowance, is_active, created_at, updated_at) FROM stdin;
3b33da29-27d4-43fa-a18f-63565f312397	somapala	0710901119	No 10, tamwatta , monaragala 	0.00	1000.00	t	2026-01-06 07:12:31.713416	2026-01-06 07:26:08.631026
572c917f-9c3f-43b1-a488-5fcfad58ec17	Sugath	0711191542	No 11, nakkala , monaragala	0.00	5000.00	t	2026-01-06 07:27:11.498918	2026-01-06 07:27:48.142176
a52afdee-ed01-4589-9760-e1513d502681	Samarasekara	0710802456	No 20 , nakkala , monaragala	0.00	0.00	t	2026-01-06 14:54:06.610764	2026-01-06 14:54:06.610764
833b376a-e96f-4099-83fa-ae73118f6b15	sunil	074582666	sssdgsgsggs	0.00	0.00	t	2026-01-11 13:32:49.894751	2026-01-11 13:32:49.894751
\.


--
-- Data for Name: inventory_batches; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.inventory_batches (id, inventory_item_id, production_id, batch_number, quantity, production_date, expiry_date, status, created_at, updated_at) FROM stdin;
1df5fd56-2e37-4092-91cb-1267096a9deb	edf1a6d5-74f8-4efe-a51e-14595b6befb2	2c57e578-3972-4c82-81cc-37bf4798e10e	2026-01-08-001	5.00	2026-01-08	\N	allocated	2026-01-08 16:17:26.773062	2026-01-08 16:17:57.824356
eac992ca-37dc-4289-9f86-7191e6fd0a77	edf1a6d5-74f8-4efe-a51e-14595b6befb2	e46a15a9-5263-4b68-9094-e4c70d789c1b	2026-01-08-003	5.00	2026-01-08	\N	available	2026-01-08 16:41:39.180329	2026-01-08 16:41:39.180329
c7b0b30c-7eae-43d9-9fbc-a8f3df134c68	edf1a6d5-74f8-4efe-a51e-14595b6befb2	8cc5b220-84e3-4a8a-a4a6-f1839dd7c9ba	2026-01-09-002	50.00	2026-01-09	\N	allocated	2026-01-09 06:18:56.235645	2026-01-09 06:20:35.427699
151dfba2-af6b-4f15-9bae-3fd053ff3b12	94e9dc89-7004-4e35-aa83-a669802aa2c1	2533d7a0-4ed9-4a14-8a84-658aa2edfda2	2026-01-09-003	4.00	2026-01-09	\N	available	2026-01-09 09:14:24.591382	2026-01-09 12:30:00.071948
e1166cd2-31bb-4589-b02a-191d8fbb9878	94e9dc89-7004-4e35-aa83-a669802aa2c1	3ff59cef-ad2d-4d68-8915-a8ff3165a235	2026-01-09-002	20.00	2026-01-09	\N	available	2026-01-09 05:07:50.958253	2026-01-09 12:30:00.071948
b640668b-47b9-44d9-8d46-9d4348911083	edf1a6d5-74f8-4efe-a51e-14595b6befb2	672256e9-9af2-442a-bc03-ef83577fe9a9	2026-01-09-001	5.00	2026-01-09	\N	available	2026-01-09 04:36:27.051042	2026-01-09 12:30:00.071948
5215a02e-c0a1-4ad2-a286-12a51547ddab	94e9dc89-7004-4e35-aa83-a669802aa2c1	d841a096-ffac-4a8d-832e-0d08abcc91cf	2026-01-09-001	5.00	2026-01-09	\N	available	2026-01-09 04:45:20.322776	2026-01-09 12:30:00.071948
062c870e-b80f-4f8b-ba1b-ecf018974778	0574954b-2ac1-4d6a-a2fc-bc7669018203	57b2894e-0479-4851-94c6-2387e4c53d38	2026-01-10-001	5.00	2026-01-10	\N	available	2026-01-10 03:44:52.035962	2026-01-10 03:45:37.485777
95c8571c-d08c-4b4b-b98c-63806e1097d5	0574954b-2ac1-4d6a-a2fc-bc7669018203	3423cbbc-5faf-4b44-bade-f9daeb286b81	2026-01-11-002	300.00	2026-01-11	\N	available	2026-01-11 04:34:30.445711	2026-01-11 12:30:00.051534
9f89addf-1d9a-4233-ac99-5d1db2ae42a1	0574954b-2ac1-4d6a-a2fc-bc7669018203	8ccf6679-42a1-48e0-a912-3c36df45bb78	2026-01-11-001	50.00	2026-01-11	\N	available	2026-01-11 04:33:31.907116	2026-01-11 12:30:00.051534
9acdbbd4-f149-4568-b60a-9ecbed1bc5eb	94e9dc89-7004-4e35-aa83-a669802aa2c1	fb6ad5b8-a5d8-4b7b-b75a-4c6f6431623b	2026-01-11-001	10.00	2026-01-11	\N	available	2026-01-11 04:24:09.889118	2026-01-11 12:30:00.051534
3bda7bc3-2c2a-4feb-b8c7-c92c01e33d38	edf1a6d5-74f8-4efe-a51e-14595b6befb2	f636b563-a146-4fb1-ab9d-aeea8928bcfa	2026-01-11-001	20.00	2026-01-11	\N	allocated	2026-01-11 13:54:47.161434	2026-01-11 13:55:29.1393
957589cc-f420-47c8-8c10-595a9b98cda5	edf1a6d5-74f8-4efe-a51e-14595b6befb2	2cebdda7-be8e-41fb-8ae4-ca2227857abb	2026-01-13-001	50.00	2026-01-13	\N	available	2026-01-13 11:26:02.221459	2026-01-13 11:26:02.221459
bd67c07e-84a7-4e24-b158-e181f9dd841b	edf1a6d5-74f8-4efe-a51e-14595b6befb2	4ed4a859-0895-4ed1-828e-11c7ff2cf2a1	2026-01-08-002	150.00	2026-01-08	\N	available	2026-01-08 16:40:47.92958	2026-01-14 10:04:29.116971
4e01b300-86df-4d97-a7d7-41b637234bd9	edf1a6d5-74f8-4efe-a51e-14595b6befb2	2bc0ea85-86b3-42ce-82eb-b225062d72ad	2026-01-15-001	100.00	2026-01-15	\N	available	2026-01-15 04:33:00.585944	2026-01-15 04:33:00.585944
\.


--
-- Data for Name: inventory_categories; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.inventory_categories (id, name, description, created_at) FROM stdin;
2fb15d1e-2eae-4dc9-9676-f180a0db745a	Packaging Materials	Packaging materials like cups, bottles, packets	2026-01-06 06:18:07.522053
0bdae6ac-6979-4ce9-ba95-6d1fd802fdf0	Raw Materials	Raw materials including milk, sugar, starter culture, etc.	2026-01-06 06:18:07.522053
f8eddfdb-a81f-4209-a492-eee4428e45bf	Utilities & Energy	Utilities and energy consumables	2026-01-06 06:18:07.522053
15585139-a24c-4e77-a056-9f8d792b35d1	Finished Goods	Finished products ready for sale	2026-01-06 06:18:07.522053
\.


--
-- Data for Name: inventory_items; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.inventory_items (id, name, category_id, unit, quantity, min_quantity, expiry_date, price, created_at, updated_at) FROM stdin;
0574954b-2ac1-4d6a-a2fc-bc7669018203	Ice cream	15585139-a24c-4e77-a056-9f8d792b35d1	piece	355.00	100.00	\N	0.00	2026-01-10 03:44:52.035962	2026-01-11 12:30:00.051534
94e9dc89-7004-4e35-aa83-a669802aa2c1	Yogurt drink 	15585139-a24c-4e77-a056-9f8d792b35d1	piece	39.00	30.00	\N	0.00	2026-01-09 04:45:20.322776	2026-01-11 12:30:00.051534
267a8f3c-4f7b-484f-8d00-8af505e773b9	Ice Packets	2fb15d1e-2eae-4dc9-9676-f180a0db745a	piece	100.00	10.00	\N	0.00	2026-01-15 04:23:09.100522	2026-01-15 04:31:04.96966
fd5486af-8abe-4b94-9619-f417e7654de3	Yogurt Cups	2fb15d1e-2eae-4dc9-9676-f180a0db745a	piece	100.00	10.00	\N	0.00	2026-01-15 04:23:09.092651	2026-01-15 04:31:18.057507
096651f2-c675-44d1-82f4-aced51e09b2d	Yogurt Drink Bottles	2fb15d1e-2eae-4dc9-9676-f180a0db745a	piece	100.00	10.00	\N	0.00	2026-01-15 04:23:09.09869	2026-01-15 04:31:31.184961
aba42316-3dc0-42b2-9ecb-74f87e233458	Milk Powder	0bdae6ac-6979-4ce9-ba95-6d1fd802fdf0	kg	10.00	2.00	\N	0.00	2026-01-15 04:23:09.107359	2026-01-15 04:31:45.414416
bbea9be6-d2d7-4b13-8506-9fb02d93a37e	Stabilizer	0bdae6ac-6979-4ce9-ba95-6d1fd802fdf0	kg	10.00	4.00	\N	0.00	2026-01-15 04:23:09.109376	2026-01-15 04:32:01.257437
e8de59b4-b7b4-4056-a544-3cf9230a71ad	Starter Culture	0bdae6ac-6979-4ce9-ba95-6d1fd802fdf0	kg	10.00	5.00	\N	0.00	2026-01-15 04:23:09.103216	2026-01-15 04:32:10.138758
585718b9-1155-4855-be3c-f8e18e9315b5	Sugar	0bdae6ac-6979-4ce9-ba95-6d1fd802fdf0	kg	10.00	2.00	\N	0.00	2026-01-15 04:23:09.105322	2026-01-15 04:32:21.837536
a216679a-f50b-470f-81b6-e95c380139e0	Flavors	0bdae6ac-6979-4ce9-ba95-6d1fd802fdf0	kg	10.00	5.00	\N	0.00	2026-01-15 04:23:09.111456	2026-01-15 04:32:31.805451
8fe0c67a-9f60-49ab-86ef-d75d36cc15c8	Salt	0bdae6ac-6979-4ce9-ba95-6d1fd802fdf0	g	242.70	100.00	2026-01-29	510.00	2026-01-08 16:12:37.272955	2026-01-15 04:33:00.585944
7e718fd6-b826-4739-aa5d-571758d66f4d	Suger 	0bdae6ac-6979-4ce9-ba95-6d1fd802fdf0	g	208.00	200.00	2026-01-31	600.00	2026-01-08 16:11:46.735102	2026-01-15 04:33:28.867311
b4fd40cd-b018-4fa2-9178-7de115007db5	Milk	0bdae6ac-6979-4ce9-ba95-6d1fd802fdf0	liter	11055.55	100.00	\N	0.00	2026-01-08 14:54:01.201094	2026-01-15 04:42:08.971661
edf1a6d5-74f8-4efe-a51e-14595b6befb2	Set Yogurt	15585139-a24c-4e77-a056-9f8d792b35d1	piece	250.00	50.00	\N	0.00	2026-01-08 16:17:26.773062	2026-01-15 04:49:43.3741
\.


--
-- Data for Name: milk_collections; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.milk_collections (id, farmer_id, date, "time", quantity_liters, notes, created_at, updated_at) FROM stdin;
e8b1d64e-410f-4599-bb5a-d1d53cf988a1	3b33da29-27d4-43fa-a18f-63565f312397	2026-01-06	07:24:34.952555	50.00	\N	2026-01-06 07:24:34.952555	2026-01-06 07:24:34.952555
9ee0e03b-ba6e-4c1e-bde2-4e32b67fce53	572c917f-9c3f-43b1-a488-5fcfad58ec17	2026-01-06	07:27:32.556311	100.00	\N	2026-01-06 07:27:32.556311	2026-01-06 07:27:32.556311
e603d2d9-00f4-42e9-8978-04083ca8c48c	572c917f-9c3f-43b1-a488-5fcfad58ec17	2026-01-06	07:33:00.555409	25.00	\N	2026-01-06 07:33:00.555409	2026-01-06 07:33:00.555409
53d7662e-7e55-4cd1-a028-cffe9e3d6e9a	a52afdee-ed01-4589-9760-e1513d502681	2026-01-06	20:25:00	100.00	\N	2026-01-06 14:55:16.740628	2026-01-06 14:55:16.740628
fcd3ad76-7881-4b23-b25d-3e368f836f93	3b33da29-27d4-43fa-a18f-63565f312397	2026-01-08	09:53:00	150.00	\N	2026-01-08 04:23:38.577161	2026-01-08 04:23:38.577161
debed70d-d833-41c4-b753-edbca8923c8d	a52afdee-ed01-4589-9760-e1513d502681	2026-01-08	20:09:00	500.00	\N	2026-01-08 14:40:04.523925	2026-01-08 14:40:04.523925
997cbc7a-decd-4a75-baa0-31160065ea33	572c917f-9c3f-43b1-a488-5fcfad58ec17	2026-01-08	20:10:00	50.00	\N	2026-01-08 14:40:10.743053	2026-01-08 14:40:10.743053
7cdc8961-58aa-49b7-8fea-31deb5d2a9e9	3b33da29-27d4-43fa-a18f-63565f312397	2026-01-08	20:10:00	150.00	\N	2026-01-08 14:40:16.447334	2026-01-08 14:40:16.447334
95590818-e1de-4629-9479-f9cbc139f9ca	a52afdee-ed01-4589-9760-e1513d502681	2026-01-09	08:59:00	6.00	\N	2026-01-09 03:30:02.882304	2026-01-09 03:30:02.882304
6534b914-8723-45dc-b287-298ed8f30ed6	572c917f-9c3f-43b1-a488-5fcfad58ec17	2026-01-09	09:00:00	10.00	\N	2026-01-09 03:30:10.637477	2026-01-09 03:30:10.637477
e6787b61-2846-47a2-863e-a3cff6e503aa	3b33da29-27d4-43fa-a18f-63565f312397	2026-01-09	09:00:00	15.00	\N	2026-01-09 03:30:17.549271	2026-01-09 03:30:17.549271
9ede3800-4124-4e19-8436-ab581616bb75	a52afdee-ed01-4589-9760-e1513d502681	2026-01-09	09:04:00	10.00	\N	2026-01-09 03:34:35.973115	2026-01-09 03:34:35.973115
0a0795ea-2358-4700-a6eb-9633c2e32238	a52afdee-ed01-4589-9760-e1513d502681	2026-01-09	14:46:00	400.00	\N	2026-01-09 09:16:25.591846	2026-01-09 09:16:25.591846
de6e58dd-fa29-4f5b-84c0-49174c34cf30	572c917f-9c3f-43b1-a488-5fcfad58ec17	2026-01-09	14:46:00	300.00	\N	2026-01-09 09:16:32.789305	2026-01-09 09:16:32.789305
edc10e69-48f8-4202-abd5-809b65fc4799	3b33da29-27d4-43fa-a18f-63565f312397	2026-01-09	14:46:00	500.00	\N	2026-01-09 09:16:40.256719	2026-01-09 09:16:40.256719
d99ff8d9-9293-4171-9f86-59b895d2d627	a52afdee-ed01-4589-9760-e1513d502681	2026-01-09	14:57:00	500.00	\N	2026-01-09 09:27:30.484984	2026-01-09 09:27:30.484984
40a7b7ac-b0a2-4d51-b578-5a48dadc3723	572c917f-9c3f-43b1-a488-5fcfad58ec17	2026-01-09	14:57:00	400.00	\N	2026-01-09 09:27:39.779064	2026-01-09 09:27:39.779064
2ab6811b-1928-455b-af36-ab7604c860c3	3b33da29-27d4-43fa-a18f-63565f312397	2026-01-09	14:57:00	300.00	\N	2026-01-09 09:27:46.522701	2026-01-09 09:27:46.522701
c63e2b56-3c08-4003-acb6-84bd5fffa8d5	a52afdee-ed01-4589-9760-e1513d502681	2026-01-09	15:01:00	4000.00	\N	2026-01-09 09:31:38.951597	2026-01-09 09:31:38.951597
bb08f40b-9eac-47e6-86b7-440916e91529	572c917f-9c3f-43b1-a488-5fcfad58ec17	2026-01-09	15:01:00	5000.00	\N	2026-01-09 09:31:46.955026	2026-01-09 09:31:46.955026
99bebee4-d446-45ab-add6-10451d81a153	a52afdee-ed01-4589-9760-e1513d502681	2026-01-11	09:51:00	150.00	\N	2026-01-11 04:21:33.976892	2026-01-11 04:21:33.976892
3e55bea5-f988-4842-ad1b-2c358739bcec	572c917f-9c3f-43b1-a488-5fcfad58ec17	2026-01-11	09:51:00	500.00	\N	2026-01-11 04:21:58.418032	2026-01-11 04:21:58.418032
520580cf-524c-43a9-9902-bce51ce711c4	3b33da29-27d4-43fa-a18f-63565f312397	2026-01-11	09:52:00	800.00	\N	2026-01-11 04:22:07.909162	2026-01-11 04:22:07.909162
953e81ed-2ba0-4089-903c-766db8106f2b	a52afdee-ed01-4589-9760-e1513d502681	2026-01-11	10:33:00	2000.00	\N	2026-01-11 05:04:03.466628	2026-01-11 05:04:03.466628
0365a305-312e-47c5-8c76-e6506fdda507	a52afdee-ed01-4589-9760-e1513d502681	2026-01-11	13:24:00	1000.00	\N	2026-01-11 07:54:52.700571	2026-01-11 07:54:52.700571
ba2853aa-d240-4b42-ae11-e8111fd88d2e	833b376a-e96f-4099-83fa-ae73118f6b15	2026-01-11	19:03:00	500.00	\N	2026-01-11 13:33:53.451921	2026-01-11 13:33:53.451921
5a6da9f1-b940-487d-b8a0-f1571aebf3dc	833b376a-e96f-4099-83fa-ae73118f6b15	2026-01-11	19:04:00	5.05	\N	2026-01-11 13:34:09.173505	2026-01-11 13:34:09.173505
0272cf5f-a898-4df3-b717-3b164a858558	a52afdee-ed01-4589-9760-e1513d502681	2026-01-13	06:52:00	10.00	\N	2026-01-13 01:22:54.806286	2026-01-13 01:22:54.806286
a9fc322e-d80e-4eea-9585-103082a56d81	572c917f-9c3f-43b1-a488-5fcfad58ec17	2026-01-13	06:52:00	220.00	\N	2026-01-13 01:23:03.100437	2026-01-13 01:23:03.100437
ff7c1c74-6673-4fef-9869-d3ea048bb97f	3b33da29-27d4-43fa-a18f-63565f312397	2026-01-13	06:53:00	150.00	\N	2026-01-13 01:23:12.29434	2026-01-13 01:23:12.29434
352cd3e8-b62a-475f-a2c8-2305b801bd9e	833b376a-e96f-4099-83fa-ae73118f6b15	2026-01-13	06:53:00	50.00	\N	2026-01-13 01:23:21.139832	2026-01-13 01:23:21.139832
2ba76dfe-4b8e-4464-9da3-687aad19a631	3b33da29-27d4-43fa-a18f-63565f312397	2026-01-13	06:53:00	1000.00	\N	2026-01-13 01:23:44.162787	2026-01-13 01:23:44.162787
b7758681-6786-450c-b5aa-04b93733d4ac	3b33da29-27d4-43fa-a18f-63565f312397	2026-01-15	10:12:00	10.00	\N	2026-01-15 04:42:08.971661	2026-01-15 04:42:08.971661
\.


--
-- Data for Name: payment_free_items; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.payment_free_items (id, payment_id, product_id, quantity, created_by, created_at) FROM stdin;
552fbe61-ce2f-46eb-93e0-c444ef7add82	817929e9-7d96-454a-b665-d4576f1ae9ed	96191b15-5b8a-4ff5-8a87-e56e64980bda	1.00	5da64e83-1413-4d59-b6f9-772f09242a79	2026-01-15 04:24:42.249406
\.


--
-- Data for Name: payments; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.payments (id, sale_id, cash_amount, cheque_amount, status, payment_date, notes, created_at, updated_at, ongoing_amount) FROM stdin;
42dfcd1a-54ff-4879-b7ce-c28f925f0891	3ddbc135-d912-49ca-bd57-e9a5837840f8	300.00	500.00	completed	2026-01-09	\N	2026-01-09 17:43:23.166433	2026-01-09 17:43:23.166433	0.00
4cb95a48-3a84-420d-8243-9bb25398c22d	d1b67733-f066-4064-9496-11197bb4b55f	0.00	0.00	pending	2026-01-09	\N	2026-01-09 17:52:34.041961	2026-01-09 17:52:34.041961	1200.00
df46b213-64be-4d19-9a33-6093c30dc47e	002d604f-6d13-487c-996a-8e77816c2b3f	680.00	1000.00	completed	2026-01-09	\N	2026-01-09 18:31:26.992832	2026-01-09 18:31:26.992832	0.00
5dc7ea28-af2b-4386-aca8-0bd8baaaf14f	24fafaa8-bf55-4708-b08a-769064fd3744	900.00	0.00	completed	2026-01-10	\N	2026-01-10 03:46:28.972488	2026-01-10 03:46:28.972488	0.00
8b4431a7-88c6-4d5c-968d-52f56a5bc0b7	08637b1c-4636-4bb7-af8f-b6abe863f7c0	680.00	1000.00	completed	2026-01-10	\N	2026-01-10 04:12:27.507112	2026-01-10 04:12:27.507112	0.00
2481c5aa-5e21-4aa1-b1e0-b3a280d57482	044dd944-be0d-4fe5-9a61-cfb34591a00f	80000.00	0.00	completed	2026-01-13	\N	2026-01-13 16:47:40.632285	2026-01-13 16:47:40.632285	0.00
71a1fd46-4009-4ece-a64d-ac92c6bcfd06	675a520f-5b0d-4655-9091-e049dd21cd77	3200.00	0.00	completed	2026-01-14	\N	2026-01-14 13:55:46.470846	2026-01-14 13:55:46.470846	0.00
8ae24db0-f741-4bd6-a7fb-aadbe57e0430	60b2c23b-b928-40a7-84bd-30dcdf4a061a	200.00	0.00	completed	2026-01-14	\N	2026-01-14 13:56:31.303834	2026-01-14 13:56:31.303834	0.00
a7483964-8b1f-4d79-be62-d2364668f011	57fc78d6-7b06-4dea-8b23-467f203c7fde	1300.00	0.00	completed	2026-01-14	\N	2026-01-14 13:57:14.848695	2026-01-14 13:57:14.848695	0.00
817929e9-7d96-454a-b665-d4576f1ae9ed	9ee0c135-88c0-4083-96c0-cd260d973d35	1.00	0.00	completed	2026-01-15	\N	2026-01-15 04:24:42.249406	2026-01-15 04:24:42.249406	0.00
1ddfd698-2767-4a64-88fc-a19670893a1a	632fbfaf-fb5a-4500-b053-65130d7a6626	500.00	0.00	completed	2026-01-15	\N	2026-01-15 05:17:39.658263	2026-01-15 05:17:39.658263	0.00
9d65461f-82fd-4210-9c16-1e446915b45a	479eb6fc-ccb9-402f-bfdd-f28c660a66cc	19001.00	0.00	completed	2026-01-15	\N	2026-01-15 05:29:43.471573	2026-01-15 05:29:43.471573	0.00
\.


--
-- Data for Name: payroll; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.payroll (id, worker_id, month, year, days_present, main_salary, monthly_bonus, advance_amount, net_pay, payment_date, payment_status, notes, created_at, updated_at, created_by, daily_salary, working_days, gross_salary, epf_amount, etf_amount, total_deductions, late_bonus) FROM stdin;
a713156d-d90d-48cc-897e-8d81cc4344a8	27de7239-a943-4237-af2f-a1ce67933182	12	2025	0	55800.00	0.00	0.00	49662.00	\N	pending	\N	2026-01-14 16:55:42.385283	2026-01-14 16:55:42.385283	5da64e83-1413-4d59-b6f9-772f09242a79	1800.00	31	55800.00	4464.00	1674.00	6138.00	0.00
742440bb-cf89-46f9-9ce7-706eb1b4c7f1	128dc10c-d8a1-4176-ae8a-bcc9120dc721	1	2026	0	27000.00	1000.00	28000.00	-2902.00	\N	pending	\N	2026-01-12 07:39:36.196361	2026-01-15 04:49:35.53902	5da64e83-1413-4d59-b6f9-772f09242a79	1800.00	15	28200.00	2256.00	846.00	31102.00	200.00
\.


--
-- Data for Name: product_bom; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.product_bom (id, product_id, inventory_item_id, quantity_required, unit, created_at, updated_at) FROM stdin;
3264b737-38f5-4f64-a8a7-db766366ca6f	e07d805a-8199-4333-8461-f2c0889284da	7e718fd6-b826-4739-aa5d-571758d66f4d	20.00	g	2026-01-08 18:41:33.102634	2026-01-08 18:41:33.102634
4aec3342-b380-45b4-aada-40ab05cdb4d2	e07d805a-8199-4333-8461-f2c0889284da	8fe0c67a-9f60-49ab-86ef-d75d36cc15c8	5.00	g	2026-01-08 18:41:38.742464	2026-01-08 18:41:38.742464
6abc9c46-909b-40d5-94e3-265ccca99f93	96191b15-5b8a-4ff5-8a87-e56e64980bda	b4fd40cd-b018-4fa2-9178-7de115007db5	0.10	liter	2026-01-08 18:22:14.342796	2026-01-08 18:22:14.342796
994f4262-1449-497d-8b05-a04fb48cd1ab	e07d805a-8199-4333-8461-f2c0889284da	b4fd40cd-b018-4fa2-9178-7de115007db5	50.00	liter	2026-01-09 09:15:24.194281	2026-01-09 09:15:24.194281
cc48af67-23d6-4ce5-8e3f-e5348ac6ab01	6e367f07-3921-48f5-b44f-a328cdd65693	b4fd40cd-b018-4fa2-9178-7de115007db5	2.00	liter	2026-01-10 03:44:17.456721	2026-01-10 03:44:17.456721
de14b3f4-9637-4a3a-b6e6-18501fa026a0	6e367f07-3921-48f5-b44f-a328cdd65693	7e718fd6-b826-4739-aa5d-571758d66f4d	5.00	g	2026-01-10 03:44:26.207506	2026-01-10 03:44:26.207506
121fe257-dc21-49af-9934-02a6fdf26657	96191b15-5b8a-4ff5-8a87-e56e64980bda	7e718fd6-b826-4739-aa5d-571758d66f4d	10.60	g	2026-01-11 13:51:14.632402	2026-01-11 13:51:14.632402
155b304b-8f81-4a65-a7c9-9261a0e232df	96191b15-5b8a-4ff5-8a87-e56e64980bda	8fe0c67a-9f60-49ab-86ef-d75d36cc15c8	0.19	g	2026-01-11 13:51:45.779335	2026-01-11 13:51:45.779335
0d9526f0-6b84-4958-9bd3-bdecf0c65f19	deb876bc-fbfb-409a-86b7-0c350513f369	7e718fd6-b826-4739-aa5d-571758d66f4d	10.60	g	2026-01-11 13:53:41.132251	2026-01-11 13:53:41.132251
\.


--
-- Data for Name: productions; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.productions (id, date, product_id, quantity_produced, notes, created_by, created_at, updated_at, batch) FROM stdin;
69c2b0e6-9df8-4bf1-ae8d-1f0c0871abf4	2026-01-08	96191b15-5b8a-4ff5-8a87-e56e64980bda	40.00	\N	5da64e83-1413-4d59-b6f9-772f09242a79	2026-01-08 14:55:35.57192	2026-01-08 14:55:35.57192	2026-01-08-001
2c57e578-3972-4c82-81cc-37bf4798e10e	2026-01-08	96191b15-5b8a-4ff5-8a87-e56e64980bda	5.00	\N	5da64e83-1413-4d59-b6f9-772f09242a79	2026-01-08 16:17:26.773062	2026-01-08 16:17:26.773062	2026-01-08-001
4ed4a859-0895-4ed1-828e-11c7ff2cf2a1	2026-01-08	96191b15-5b8a-4ff5-8a87-e56e64980bda	1200.00	\N	5da64e83-1413-4d59-b6f9-772f09242a79	2026-01-08 16:40:47.92958	2026-01-08 16:40:47.92958	2026-01-08-002
e46a15a9-5263-4b68-9094-e4c70d789c1b	2026-01-08	96191b15-5b8a-4ff5-8a87-e56e64980bda	5.00	\N	5da64e83-1413-4d59-b6f9-772f09242a79	2026-01-08 16:41:39.180329	2026-01-08 16:41:39.180329	2026-01-08-003
407751be-e10c-4235-ba8b-a90564d281b8	2026-01-09	e07d805a-8199-4333-8461-f2c0889284da	40.00	\N	5da64e83-1413-4d59-b6f9-772f09242a79	2026-01-09 04:30:48.652781	2026-01-09 04:30:48.652781	2026-01-09-001
672256e9-9af2-442a-bc03-ef83577fe9a9	2026-01-09	96191b15-5b8a-4ff5-8a87-e56e64980bda	5.00	\N	5da64e83-1413-4d59-b6f9-772f09242a79	2026-01-09 04:36:27.051042	2026-01-09 04:36:27.051042	2026-01-09-001
d841a096-ffac-4a8d-832e-0d08abcc91cf	2026-01-09	e07d805a-8199-4333-8461-f2c0889284da	50.00	\N	5da64e83-1413-4d59-b6f9-772f09242a79	2026-01-09 04:45:20.322776	2026-01-09 04:45:20.322776	2026-01-09-001
3ff59cef-ad2d-4d68-8915-a8ff3165a235	2026-01-09	e07d805a-8199-4333-8461-f2c0889284da	20.00	\N	5da64e83-1413-4d59-b6f9-772f09242a79	2026-01-09 05:07:50.958253	2026-01-09 05:07:50.958253	2026-01-09-002
8cc5b220-84e3-4a8a-a4a6-f1839dd7c9ba	2026-01-09	96191b15-5b8a-4ff5-8a87-e56e64980bda	50.00	\N	5da64e83-1413-4d59-b6f9-772f09242a79	2026-01-09 06:18:56.235645	2026-01-09 06:18:56.235645	2026-01-09-002
2533d7a0-4ed9-4a14-8a84-658aa2edfda2	2026-01-09	e07d805a-8199-4333-8461-f2c0889284da	4.00	\N	5da64e83-1413-4d59-b6f9-772f09242a79	2026-01-09 09:14:24.591382	2026-01-09 09:14:24.591382	2026-01-09-003
57b2894e-0479-4851-94c6-2387e4c53d38	2026-01-10	6e367f07-3921-48f5-b44f-a328cdd65693	50.00	\N	5da64e83-1413-4d59-b6f9-772f09242a79	2026-01-10 03:44:52.035962	2026-01-10 03:44:52.035962	2026-01-10-001
fb6ad5b8-a5d8-4b7b-b75a-4c6f6431623b	2026-01-11	e07d805a-8199-4333-8461-f2c0889284da	20.00	\N	5da64e83-1413-4d59-b6f9-772f09242a79	2026-01-11 04:24:09.889118	2026-01-11 04:24:09.889118	2026-01-11-001
8ccf6679-42a1-48e0-a912-3c36df45bb78	2026-01-11	6e367f07-3921-48f5-b44f-a328cdd65693	100.00	\N	5da64e83-1413-4d59-b6f9-772f09242a79	2026-01-11 04:33:31.907116	2026-01-11 04:33:31.907116	2026-01-11-001
3423cbbc-5faf-4b44-bade-f9daeb286b81	2026-01-11	6e367f07-3921-48f5-b44f-a328cdd65693	379.00	\N	5da64e83-1413-4d59-b6f9-772f09242a79	2026-01-11 04:34:30.445711	2026-01-11 04:34:30.445711	2026-01-11-002
f636b563-a146-4fb1-ab9d-aeea8928bcfa	2026-01-11	96191b15-5b8a-4ff5-8a87-e56e64980bda	20.00	\N	5da64e83-1413-4d59-b6f9-772f09242a79	2026-01-11 13:54:47.161434	2026-01-11 13:54:47.161434	2026-01-11-001
2cebdda7-be8e-41fb-8ae4-ca2227857abb	2026-01-13	96191b15-5b8a-4ff5-8a87-e56e64980bda	50.00	\N	5da64e83-1413-4d59-b6f9-772f09242a79	2026-01-13 11:26:02.221459	2026-01-13 11:26:02.221459	2026-01-13-001
2bc0ea85-86b3-42ce-82eb-b225062d72ad	2026-01-15	96191b15-5b8a-4ff5-8a87-e56e64980bda	100.00	\N	5da64e83-1413-4d59-b6f9-772f09242a79	2026-01-15 04:33:00.585944	2026-01-15 04:33:00.585944	2026-01-15-001
\.


--
-- Data for Name: products; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.products (id, name, category, selling_price, is_active, description, created_at, updated_at) FROM stdin;
96191b15-5b8a-4ff5-8a87-e56e64980bda	Set Yogurt	Yoghurt	80.00	t	\N	2026-01-06 17:21:50.201608	2026-01-06 17:21:50.201608
e07d805a-8199-4333-8461-f2c0889284da	Yogurt drink 	Drink	80.00	t	\N	2026-01-08 18:41:14.720011	2026-01-08 18:41:14.720011
6e367f07-3921-48f5-b44f-a328cdd65693	Ice cream	Ice Cream	20.00	t	\N	2026-01-10 03:44:06.331493	2026-01-10 03:44:06.331493
deb876bc-fbfb-409a-86b7-0c350513f369	pani yogurt	Yoghurt	80.00	t	\N	2026-01-11 13:53:19.076566	2026-01-11 13:53:19.076566
\.


--
-- Data for Name: returns; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.returns (id, sale_id, product_id, quantity, reason, replacement_given, replacement_product_id, replacement_quantity, processed_by, created_at, updated_at) FROM stdin;
abdf452c-b33d-4fe5-ac10-699ba45ce116	632fbfaf-fb5a-4500-b053-65130d7a6626	6e367f07-3921-48f5-b44f-a328cdd65693	5.00	\N	f	\N	\N	e093c86e-e49f-445c-9751-f63ed64c4eb5	2026-01-15 05:17:39.637615	2026-01-15 05:17:39.637615
fcb1a6eb-03cd-46af-82e1-d1deac5ed0df	632fbfaf-fb5a-4500-b053-65130d7a6626	96191b15-5b8a-4ff5-8a87-e56e64980bda	3.00	\N	f	\N	\N	e093c86e-e49f-445c-9751-f63ed64c4eb5	2026-01-15 05:17:39.637615	2026-01-15 05:17:39.637615
\.


--
-- Data for Name: salary_bonus; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.salary_bonus (id, worker_id, month, year, monthly_bonus, late_bonus, notes, created_at, updated_at) FROM stdin;
a5f3c45d-cbbd-4fbb-b34f-2415452b850e	128dc10c-d8a1-4176-ae8a-bcc9120dc721	1	2026	1000.00	200.00	\N	2026-01-12 07:37:14.285785	2026-01-12 07:37:14.285785
\.


--
-- Data for Name: sale_items; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.sale_items (id, sale_id, product_id, quantity, price, created_at, is_return) FROM stdin;
fed4adfe-d57b-4228-b438-8b46c79cfb10	47347fc3-8f33-456b-a6af-88f2470532d2	e07d805a-8199-4333-8461-f2c0889284da	10.00	80.00	2026-01-09 10:22:48.966459	f
767d22b7-a275-4764-b13e-ee1ca2b218fd	82713a27-857b-4a5c-984e-ace5c7e3d038	96191b15-5b8a-4ff5-8a87-e56e64980bda	40.00	70.00	2026-01-09 10:29:03.341584	f
4c2db8cd-2a34-4a2b-95df-f95424fc43c6	3ddbc135-d912-49ca-bd57-e9a5837840f8	96191b15-5b8a-4ff5-8a87-e56e64980bda	10.00	80.00	2026-01-09 17:43:23.166433	f
79136cdd-8ad5-48e9-82e9-a68fd59e5405	d1b67733-f066-4064-9496-11197bb4b55f	e07d805a-8199-4333-8461-f2c0889284da	15.00	80.00	2026-01-09 17:52:34.041961	f
d6eb98ed-5851-40bd-b48e-e2905aebb1d4	002d604f-6d13-487c-996a-8e77816c2b3f	96191b15-5b8a-4ff5-8a87-e56e64980bda	21.00	80.00	2026-01-09 18:31:26.992832	f
fc71a242-b8e1-46cf-85cc-c4076b8f30b8	24fafaa8-bf55-4708-b08a-769064fd3744	6e367f07-3921-48f5-b44f-a328cdd65693	45.00	20.00	2026-01-10 03:46:28.972488	f
96e3f92d-04b9-4a86-a1e7-73b5a46aba9f	08637b1c-4636-4bb7-af8f-b6abe863f7c0	96191b15-5b8a-4ff5-8a87-e56e64980bda	10.00	80.00	2026-01-11 14:20:09.808791	f
3842faa9-a252-438a-b66c-a89a84192f37	be7459fe-bde2-4832-859c-6c8819fcd6cf	96191b15-5b8a-4ff5-8a87-e56e64980bda	40.00	80.00	2026-01-11 19:32:37.388765	f
012969a3-80b8-474b-be2b-177fd55977dd	c1ac1901-282d-40f0-b687-15dded32a627	e07d805a-8199-4333-8461-f2c0889284da	10.00	80.00	2026-01-11 19:32:59.835068	f
a051c197-6bb0-49eb-ba90-d1f6e453bb04	f3882f77-ddcc-45ec-9b04-64c2d30eb2d9	6e367f07-3921-48f5-b44f-a328cdd65693	39.99	20.00	2026-01-11 19:33:18.159476	f
fee82e17-4faa-4eff-a170-6aa899b477d8	9ee0c135-88c0-4083-96c0-cd260d973d35	96191b15-5b8a-4ff5-8a87-e56e64980bda	10.00	80.00	2026-01-11 19:33:43.060611	f
bcfe0bdd-d529-4774-a7a6-d6e774edf5a6	044dd944-be0d-4fe5-9a61-cfb34591a00f	96191b15-5b8a-4ff5-8a87-e56e64980bda	1000.00	80.00	2026-01-13 16:47:31.522358	f
d4209e59-b23a-4612-a70d-56411c679753	675a520f-5b0d-4655-9091-e049dd21cd77	96191b15-5b8a-4ff5-8a87-e56e64980bda	40.00	80.00	2026-01-14 04:59:58.642724	f
fa31a739-2003-4515-89b4-0313b571c03e	60b2c23b-b928-40a7-84bd-30dcdf4a061a	6e367f07-3921-48f5-b44f-a328cdd65693	10.00	20.00	2026-01-14 13:56:31.277584	f
491745a8-e391-44dd-ab6e-93ba900478ac	57fc78d6-7b06-4dea-8b23-467f203c7fde	6e367f07-3921-48f5-b44f-a328cdd65693	5.00	20.00	2026-01-14 13:57:14.808058	f
c43b18b4-7e48-45c7-9da8-d185cf66ee4a	57fc78d6-7b06-4dea-8b23-467f203c7fde	96191b15-5b8a-4ff5-8a87-e56e64980bda	5.00	80.00	2026-01-14 13:57:14.808058	f
6930ec5a-da12-421d-b2fd-a17f68e7cd34	57fc78d6-7b06-4dea-8b23-467f203c7fde	e07d805a-8199-4333-8461-f2c0889284da	10.00	80.00	2026-01-14 13:57:14.808058	f
f4bd4c6e-3a73-4d0f-9544-c42514fae550	632fbfaf-fb5a-4500-b053-65130d7a6626	6e367f07-3921-48f5-b44f-a328cdd65693	10.00	50.00	2026-01-15 05:17:39.593555	f
4f7e275e-05a8-4585-9086-d5822137f16c	479eb6fc-ccb9-402f-bfdd-f28c660a66cc	6e367f07-3921-48f5-b44f-a328cdd65693	114.01	100.00	2026-01-15 05:29:43.407514	f
734c604a-1173-4448-9a3f-84e6862700a3	479eb6fc-ccb9-402f-bfdd-f28c660a66cc	96191b15-5b8a-4ff5-8a87-e56e64980bda	62.00	50.00	2026-01-15 05:29:43.407514	f
b66c1f49-72f9-40ee-a5df-72443083a469	479eb6fc-ccb9-402f-bfdd-f28c660a66cc	e07d805a-8199-4333-8461-f2c0889284da	75.00	60.00	2026-01-15 05:29:43.407514	f
\.


--
-- Data for Name: sales; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.sales (id, buyer_id, salesperson_id, date, total_amount, payment_status, notes, created_at, updated_at, sold_by) FROM stdin;
78f67a15-0aa5-4935-9679-e8a088a70380	7a93cbd9-87c0-46af-b36f-37da4015d416	e093c86e-e49f-445c-9751-f63ed64c4eb5	2026-01-09	1200.00	pending	\N	2026-01-09 05:31:23.272843	2026-01-09 05:31:23.272843	SALESPERSON
47347fc3-8f33-456b-a6af-88f2470532d2	8b117a30-b9f2-439c-bdca-9afbcfeadeed	e093c86e-e49f-445c-9751-f63ed64c4eb5	2026-01-09	800.00	pending	\N	2026-01-09 10:22:48.966459	2026-01-09 10:22:48.966459	SALESPERSON
82713a27-857b-4a5c-984e-ace5c7e3d038	4bb1a2b8-df7d-4f9d-85b6-db2723d5e8c5	e093c86e-e49f-445c-9751-f63ed64c4eb5	2026-01-09	2800.00	paid	\N	2026-01-09 10:29:03.341584	2026-01-09 10:29:03.341584	SALESPERSON
3ddbc135-d912-49ca-bd57-e9a5837840f8	7a93cbd9-87c0-46af-b36f-37da4015d416	e093c86e-e49f-445c-9751-f63ed64c4eb5	2026-01-09	800.00	paid	\N	2026-01-09 17:43:23.166433	2026-01-09 17:43:23.166433	SALESPERSON
d1b67733-f066-4064-9496-11197bb4b55f	06aea30e-9de5-49ad-b863-ce1985c336bc	e093c86e-e49f-445c-9751-f63ed64c4eb5	2026-01-09	1200.00	partial	\N	2026-01-09 17:52:34.041961	2026-01-09 17:52:34.041961	SALESPERSON
002d604f-6d13-487c-996a-8e77816c2b3f	f1927a80-d3db-4135-98b4-d942e77d6d2b	e093c86e-e49f-445c-9751-f63ed64c4eb5	2026-01-09	1680.00	paid	\N	2026-01-09 18:31:26.992832	2026-01-09 18:31:26.992832	SALESPERSON
24fafaa8-bf55-4708-b08a-769064fd3744	f1927a80-d3db-4135-98b4-d942e77d6d2b	e093c86e-e49f-445c-9751-f63ed64c4eb5	2026-01-10	900.00	paid	\N	2026-01-10 03:46:28.972488	2026-01-10 03:46:28.972488	SALESPERSON
08637b1c-4636-4bb7-af8f-b6abe863f7c0	bead7fa8-4bb1-4411-b96d-62692221defa	e093c86e-e49f-445c-9751-f63ed64c4eb5	2026-01-09	800.00	paid	\N	2026-01-10 04:12:27.507112	2026-01-11 14:20:09.808791	SALESPERSON
be7459fe-bde2-4832-859c-6c8819fcd6cf	f1927a80-d3db-4135-98b4-d942e77d6d2b	e093c86e-e49f-445c-9751-f63ed64c4eb5	2026-01-11	3200.00	pending	\N	2026-01-11 19:32:37.388765	2026-01-11 19:32:37.388765	SALESPERSON
c1ac1901-282d-40f0-b687-15dded32a627	7a93cbd9-87c0-46af-b36f-37da4015d416	e093c86e-e49f-445c-9751-f63ed64c4eb5	2026-01-11	800.00	pending	\N	2026-01-11 19:32:59.835068	2026-01-11 19:32:59.835068	SALESPERSON
f3882f77-ddcc-45ec-9b04-64c2d30eb2d9	06aea30e-9de5-49ad-b863-ce1985c336bc	e093c86e-e49f-445c-9751-f63ed64c4eb5	2026-01-11	799.80	pending	\N	2026-01-11 19:33:18.159476	2026-01-11 19:33:18.159476	SALESPERSON
044dd944-be0d-4fe5-9a61-cfb34591a00f	b752b76a-834f-4533-8ef6-cefa50eaf6da	e093c86e-e49f-445c-9751-f63ed64c4eb5	2026-01-13	80000.00	paid	\N	2026-01-13 16:47:31.522358	2026-01-13 16:47:40.632285	SALESPERSON
675a520f-5b0d-4655-9091-e049dd21cd77	9d15302c-c8db-4567-8e6f-9af102b0fa06	e093c86e-e49f-445c-9751-f63ed64c4eb5	2026-01-14	3200.00	paid	\N	2026-01-14 04:59:58.642724	2026-01-14 13:55:46.470846	SALESPERSON
60b2c23b-b928-40a7-84bd-30dcdf4a061a	f1927a80-d3db-4135-98b4-d942e77d6d2b	e093c86e-e49f-445c-9751-f63ed64c4eb5	2026-01-14	200.00	paid	\N	2026-01-14 13:56:31.277584	2026-01-14 13:56:31.303834	SALESPERSON
57fc78d6-7b06-4dea-8b23-467f203c7fde	f1927a80-d3db-4135-98b4-d942e77d6d2b	e093c86e-e49f-445c-9751-f63ed64c4eb5	2026-01-14	1300.00	paid	\N	2026-01-14 13:57:14.808058	2026-01-14 13:57:14.848695	SALESPERSON
9ee0c135-88c0-4083-96c0-cd260d973d35	fccfd4af-f608-41be-be2d-985a0197836c	e093c86e-e49f-445c-9751-f63ed64c4eb5	2026-01-11	800.00	partial	\N	2026-01-11 19:33:43.060611	2026-01-15 04:24:42.249406	SALESPERSON
632fbfaf-fb5a-4500-b053-65130d7a6626	9d15302c-c8db-4567-8e6f-9af102b0fa06	e093c86e-e49f-445c-9751-f63ed64c4eb5	2026-01-15	500.00	paid	\N	2026-01-15 05:17:39.593555	2026-01-15 05:17:39.658263	SALESPERSON
479eb6fc-ccb9-402f-bfdd-f28c660a66cc	f1927a80-d3db-4135-98b4-d942e77d6d2b	e093c86e-e49f-445c-9751-f63ed64c4eb5	2026-01-15	19001.00	paid	\N	2026-01-15 05:29:43.407514	2026-01-15 05:29:43.471573	SALESPERSON
\.


--
-- Data for Name: sales_allocations; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.sales_allocations (id, production_id, product_id, quantity_allocated, allocated_to, allocation_date, status, notes, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: salesperson_allocations; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.salesperson_allocations (id, production_id, product_id, salesperson_id, batch_number, quantity_allocated, allocation_date, status, notes, allocated_by, created_at, updated_at) FROM stdin;
ceb55c5e-ddcf-482b-a3ab-12bd81c247dc	69c2b0e6-9df8-4bf1-ae8d-1f0c0871abf4	96191b15-5b8a-4ff5-8a87-e56e64980bda	e093c86e-e49f-445c-9751-f63ed64c4eb5	2026-01-08-001	30.00	2026-01-08	completed	01/08	5da64e83-1413-4d59-b6f9-772f09242a79	2026-01-08 15:11:16.428648	2026-01-11 19:32:37.388765
0fb7bd81-b498-4a3b-8c04-c48207867fa8	2c57e578-3972-4c82-81cc-37bf4798e10e	96191b15-5b8a-4ff5-8a87-e56e64980bda	e093c86e-e49f-445c-9751-f63ed64c4eb5	2026-01-08-001	5.00	2026-01-08	completed	\N	5da64e83-1413-4d59-b6f9-772f09242a79	2026-01-08 16:17:57.824356	2026-01-11 19:32:37.388765
da36b0ad-7d99-447f-88ac-08e53e730221	8cc5b220-84e3-4a8a-a4a6-f1839dd7c9ba	96191b15-5b8a-4ff5-8a87-e56e64980bda	e093c86e-e49f-445c-9751-f63ed64c4eb5	2026-01-09-002	35.00	2026-01-09	completed	123	5da64e83-1413-4d59-b6f9-772f09242a79	2026-01-09 06:20:35.376249	2026-01-13 16:47:31.522358
f2292969-d5d8-4979-91f4-465bb9b0e325	f636b563-a146-4fb1-ab9d-aeea8928bcfa	96191b15-5b8a-4ff5-8a87-e56e64980bda	e093c86e-e49f-445c-9751-f63ed64c4eb5	2026-01-11-001	20.00	2026-01-11	completed	\N	5da64e83-1413-4d59-b6f9-772f09242a79	2026-01-11 13:55:29.1393	2026-01-13 16:47:31.522358
d0e3ad78-7665-47c9-8f65-c48309a88633	57b2894e-0479-4851-94c6-2387e4c53d38	6e367f07-3921-48f5-b44f-a328cdd65693	e093c86e-e49f-445c-9751-f63ed64c4eb5	2026-01-10-001	5.01	2026-01-10	completed	\N	5da64e83-1413-4d59-b6f9-772f09242a79	2026-01-10 03:45:37.474177	2026-01-14 13:56:31.277584
c8aed64c-29cd-4415-8860-5fd6c7f64bf8	3423cbbc-5faf-4b44-bade-f9daeb286b81	6e367f07-3921-48f5-b44f-a328cdd65693	e093c86e-e49f-445c-9751-f63ed64c4eb5	2026-01-11-002	64.01	2026-01-11	completed	\N	5da64e83-1413-4d59-b6f9-772f09242a79	2026-01-11 07:29:43.16313	2026-01-15 05:29:43.407514
a8b78a10-aa2c-4f9b-a07c-54de5ef086da	8ccf6679-42a1-48e0-a912-3c36df45bb78	6e367f07-3921-48f5-b44f-a328cdd65693	e093c86e-e49f-445c-9751-f63ed64c4eb5	2026-01-11-001	50.00	2026-01-11	completed	\N	5da64e83-1413-4d59-b6f9-772f09242a79	2026-01-11 07:29:43.16313	2026-01-15 05:29:43.407514
ede62490-fb25-41f8-b148-3aaf149c7e51	4ed4a859-0895-4ed1-828e-11c7ff2cf2a1	96191b15-5b8a-4ff5-8a87-e56e64980bda	e093c86e-e49f-445c-9751-f63ed64c4eb5	2026-01-08-002	12.00	2026-01-13	completed	\N	5da64e83-1413-4d59-b6f9-772f09242a79	2026-01-13 16:46:17.17835	2026-01-15 05:29:43.407514
f73f1850-c4f2-4ba9-ad5c-f1cc2c5b7c08	4ed4a859-0895-4ed1-828e-11c7ff2cf2a1	96191b15-5b8a-4ff5-8a87-e56e64980bda	e093c86e-e49f-445c-9751-f63ed64c4eb5	2026-01-08-002	50.00	2026-01-14	completed	\N	5da64e83-1413-4d59-b6f9-772f09242a79	2026-01-14 10:04:29.116971	2026-01-15 05:29:43.407514
b39be180-81d7-494f-8740-d74295d55bdb	407751be-e10c-4235-ba8b-a90564d281b8	e07d805a-8199-4333-8461-f2c0889284da	e093c86e-e49f-445c-9751-f63ed64c4eb5	2026-01-09-001	20.00	2026-01-09	completed	\N	5da64e83-1413-4d59-b6f9-772f09242a79	2026-01-09 04:31:14.968147	2026-01-15 05:29:43.407514
f27eb791-5167-4062-a5c8-e8bd4b6abcaa	d841a096-ffac-4a8d-832e-0d08abcc91cf	e07d805a-8199-4333-8461-f2c0889284da	e093c86e-e49f-445c-9751-f63ed64c4eb5	2026-01-09-001	30.00	2026-01-09	completed	\N	5da64e83-1413-4d59-b6f9-772f09242a79	2026-01-09 04:45:53.123141	2026-01-15 05:29:43.407514
7f818e5a-2b55-46bb-ab22-a8bee3e3fad7	d841a096-ffac-4a8d-832e-0d08abcc91cf	e07d805a-8199-4333-8461-f2c0889284da	e093c86e-e49f-445c-9751-f63ed64c4eb5	2026-01-09-001	15.00	2026-01-09	completed	321	5da64e83-1413-4d59-b6f9-772f09242a79	2026-01-09 06:21:13.793769	2026-01-15 05:29:43.407514
6a45d651-693c-4b5b-9e4b-3de9ff4bd036	fb6ad5b8-a5d8-4b7b-b75a-4c6f6431623b	e07d805a-8199-4333-8461-f2c0889284da	e093c86e-e49f-445c-9751-f63ed64c4eb5	2026-01-11-001	10.00	2026-01-11	completed	\N	5da64e83-1413-4d59-b6f9-772f09242a79	2026-01-11 07:29:43.16313	2026-01-15 05:29:43.407514
\.


--
-- Data for Name: salesperson_inventory; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.salesperson_inventory (id, salesperson_id, product_id, allocated_quantity, available_quantity, allocated_by, allocated_at, updated_at) FROM stdin;
\.


--
-- Data for Name: salesperson_locations; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.salesperson_locations (id, user_id, latitude, longitude, accuracy, last_updated, created_at, status, updated_at) FROM stdin;
18ca4f9e-a480-4315-a835-120e5c2a912d	e093c86e-e49f-445c-9751-f63ed64c4eb5	6.87058000	81.34839600	500.00	2026-01-15 05:29:39.640032	2026-01-08 04:40:07.388502	online	2026-01-10 04:12:28.821393
\.


--
-- Data for Name: settings; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.settings (id, key, value, description, updated_at, updated_by) FROM stdin;
8f8e4a11-18f1-4515-8f95-cdba8fd08cda	farmer_default_free_products	[{"product_id":"96191b15-5b8a-4ff5-8a87-e56e64980bda","quantity":10,"unit":"piece"}]	\N	2026-01-11 19:20:15.160242	5da64e83-1413-4d59-b6f9-772f09242a79
e579cb3e-bb83-4c0a-aade-fdab8b16dace	milk_price_per_liter	150	Default milk price per liter for all farmers	2026-01-11 19:23:31.549524	5da64e83-1413-4d59-b6f9-772f09242a79
9b8931e1-ea88-4bf8-ae5e-b3f645613c32	worker_default_daily_salary	1800	\N	2026-01-14 10:14:33.09244	5da64e83-1413-4d59-b6f9-772f09242a79
77009746-4c6e-4453-a723-7c31715fc953	worker_default_epf_percentage	8	\N	2026-01-14 10:14:33.118967	5da64e83-1413-4d59-b6f9-772f09242a79
0dfb9df9-8c45-4d1a-8f34-ded2081c0a0f	worker_default_etf_percentage	3	\N	2026-01-14 10:14:33.138949	5da64e83-1413-4d59-b6f9-772f09242a79
b2a3b469-9365-42c6-b8c8-65f8e8494dc9	worker_default_free_products	[{"productId":"96191b15-5b8a-4ff5-8a87-e56e64980bda","quantity":20,"unit":"piece"}]	\N	2026-01-14 10:14:33.157383	5da64e83-1413-4d59-b6f9-772f09242a79
\.


--
-- Data for Name: users; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.users (id, name, email, username, password_hash, role, is_active, created_at, updated_at) FROM stdin;
5da64e83-1413-4d59-b6f9-772f09242a79	System Administrator	admin@yogurt.com	admin	$2a$10$S33Bjpq3N0qhh9gzLFVDWeNKXMKueLuNKvPFVPTnOdiaLBgjJK57u	ADMIN	t	2026-01-06 06:18:48.337216	2026-01-14 18:44:59.144475
e093c86e-e49f-445c-9751-f63ed64c4eb5	Sales Person 1	salesperson@yogurt.com	salesperson	$2a$10$GQaxIoloCNpC2opwKJdireTBCoOeQuslJdxsEVW.PFxdPEOPrwYmG	SALESPERSON	t	2026-01-06 06:18:48.345579	2026-01-14 18:44:59.165236
\.


--
-- Data for Name: worker_advances; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.worker_advances (id, worker_id, month, year, amount, payment_date, notes, created_at, updated_at, "time") FROM stdin;
5af72bd7-295e-4c55-a1cd-a8a4dfd2e87a	128dc10c-d8a1-4176-ae8a-bcc9120dc721	1	2026	20000.00	2026-01-12	\N	2026-01-12 06:21:10.666336	2026-01-12 06:21:10.666336	06:21:10.666336
440026e3-cad9-4179-a17e-e742e45fab9e	128dc10c-d8a1-4176-ae8a-bcc9120dc721	1	2026	5000.00	2026-01-14	\N	2026-01-14 10:16:35.117228	2026-01-14 10:16:35.117228	15:46:00
4caa449b-32e9-4249-9edd-0b04aaff0420	128dc10c-d8a1-4176-ae8a-bcc9120dc721	1	2026	3000.00	2026-01-14	\N	2026-01-14 10:17:35.201708	2026-01-14 10:17:35.201708	15:47:00
\.


--
-- Data for Name: worker_attendance; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.worker_attendance (id, worker_id, date, present, late_hours, notes, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: worker_free_products; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.worker_free_products (id, worker_id, month, year, inventory_item_id, product_id, quantity, unit, notes, created_at, updated_at, issued_at, issued_by) FROM stdin;
a8e030b0-63a0-47da-ac73-9e0cbb6e14d0	27de7239-a943-4237-af2f-a1ce67933182	1	2026	\N	96191b15-5b8a-4ff5-8a87-e56e64980bda	20.00	piece	\N	2026-01-15 04:47:01.74409	2026-01-15 04:47:01.74409	2026-01-15 04:47:01.74409	5da64e83-1413-4d59-b6f9-772f09242a79
46199f94-0c7f-42bc-ae32-067d196334ce	128dc10c-d8a1-4176-ae8a-bcc9120dc721	1	2026	\N	96191b15-5b8a-4ff5-8a87-e56e64980bda	20.00	piece	\N	2026-01-15 04:49:43.3741	2026-01-15 04:49:43.3741	2026-01-15 04:49:43.3741	5da64e83-1413-4d59-b6f9-772f09242a79
\.


--
-- Data for Name: worker_salary_payments; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.worker_salary_payments (id, worker_id, month, year, days_present, main_salary, monthly_bonus, late_hour_salary, advance_amount, net_pay, payment_date, payment_status, notes, created_at, updated_at, created_by) FROM stdin;
\.


--
-- Data for Name: workers; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.workers (id, name, phone, address, epf_number, etf_number, main_salary, monthly_bonus, late_hour_rate, is_active, created_at, updated_at, daily_salary, epf_percentage, etf_percentage, job_role) FROM stdin;
27de7239-a943-4237-af2f-a1ce67933182	Lakshan	07653366778	no 40 Samanala Uyana Road	05	05	46800.00	0.00	0.00	t	2026-01-14 10:06:10.084685	2026-01-14 10:14:33.176462	1800.00	8.00	3.00	Production worker
128dc10c-d8a1-4176-ae8a-bcc9120dc721	jagath	0715689745	nakkala	01	01	46800.00	0.00	0.00	t	2026-01-12 06:20:24.078829	2026-01-14 10:14:33.198458	1800.00	8.00	3.00	\N
\.


--
-- Name: buyers buyers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.buyers
    ADD CONSTRAINT buyers_pkey PRIMARY KEY (id);


--
-- Name: cheques cheques_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cheques
    ADD CONSTRAINT cheques_pkey PRIMARY KEY (id);


--
-- Name: expenses expenses_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.expenses
    ADD CONSTRAINT expenses_pkey PRIMARY KEY (id);


--
-- Name: farmer_free_products farmer_free_products_farmer_id_year_month_product_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.farmer_free_products
    ADD CONSTRAINT farmer_free_products_farmer_id_year_month_product_id_key UNIQUE (farmer_id, year, month, product_id);


--
-- Name: farmer_free_products farmer_free_products_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.farmer_free_products
    ADD CONSTRAINT farmer_free_products_pkey PRIMARY KEY (id);


--
-- Name: farmers farmers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.farmers
    ADD CONSTRAINT farmers_pkey PRIMARY KEY (id);


--
-- Name: inventory_batches inventory_batches_inventory_item_id_batch_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_batches
    ADD CONSTRAINT inventory_batches_inventory_item_id_batch_number_key UNIQUE (inventory_item_id, batch_number);


--
-- Name: inventory_batches inventory_batches_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_batches
    ADD CONSTRAINT inventory_batches_pkey PRIMARY KEY (id);


--
-- Name: inventory_categories inventory_categories_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_categories
    ADD CONSTRAINT inventory_categories_name_key UNIQUE (name);


--
-- Name: inventory_categories inventory_categories_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_categories
    ADD CONSTRAINT inventory_categories_pkey PRIMARY KEY (id);


--
-- Name: inventory_items inventory_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_items
    ADD CONSTRAINT inventory_items_pkey PRIMARY KEY (id);


--
-- Name: milk_collections milk_collections_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.milk_collections
    ADD CONSTRAINT milk_collections_pkey PRIMARY KEY (id);


--
-- Name: payment_free_items payment_free_items_payment_id_product_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_free_items
    ADD CONSTRAINT payment_free_items_payment_id_product_id_key UNIQUE (payment_id, product_id);


--
-- Name: payment_free_items payment_free_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_free_items
    ADD CONSTRAINT payment_free_items_pkey PRIMARY KEY (id);


--
-- Name: payments payments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_pkey PRIMARY KEY (id);


--
-- Name: product_bom product_bom_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_bom
    ADD CONSTRAINT product_bom_pkey PRIMARY KEY (id);


--
-- Name: product_bom product_bom_product_id_inventory_item_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_bom
    ADD CONSTRAINT product_bom_product_id_inventory_item_id_key UNIQUE (product_id, inventory_item_id);


--
-- Name: productions productions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.productions
    ADD CONSTRAINT productions_pkey PRIMARY KEY (id);


--
-- Name: products products_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_pkey PRIMARY KEY (id);


--
-- Name: returns returns_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.returns
    ADD CONSTRAINT returns_pkey PRIMARY KEY (id);


--
-- Name: salary_bonus salary_bonus_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.salary_bonus
    ADD CONSTRAINT salary_bonus_pkey PRIMARY KEY (id);


--
-- Name: salary_bonus salary_bonus_worker_id_year_month_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.salary_bonus
    ADD CONSTRAINT salary_bonus_worker_id_year_month_key UNIQUE (worker_id, year, month);


--
-- Name: sale_items sale_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sale_items
    ADD CONSTRAINT sale_items_pkey PRIMARY KEY (id);


--
-- Name: sales_allocations sales_allocations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sales_allocations
    ADD CONSTRAINT sales_allocations_pkey PRIMARY KEY (id);


--
-- Name: sales sales_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sales
    ADD CONSTRAINT sales_pkey PRIMARY KEY (id);


--
-- Name: salesperson_allocations salesperson_allocations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.salesperson_allocations
    ADD CONSTRAINT salesperson_allocations_pkey PRIMARY KEY (id);


--
-- Name: salesperson_inventory salesperson_inventory_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.salesperson_inventory
    ADD CONSTRAINT salesperson_inventory_pkey PRIMARY KEY (id);


--
-- Name: salesperson_inventory salesperson_inventory_salesperson_id_product_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.salesperson_inventory
    ADD CONSTRAINT salesperson_inventory_salesperson_id_product_id_key UNIQUE (salesperson_id, product_id);


--
-- Name: salesperson_locations salesperson_locations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.salesperson_locations
    ADD CONSTRAINT salesperson_locations_pkey PRIMARY KEY (id);


--
-- Name: salesperson_locations salesperson_locations_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.salesperson_locations
    ADD CONSTRAINT salesperson_locations_user_id_key UNIQUE (user_id);


--
-- Name: settings settings_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.settings
    ADD CONSTRAINT settings_key_key UNIQUE (key);


--
-- Name: settings settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.settings
    ADD CONSTRAINT settings_pkey PRIMARY KEY (id);


--
-- Name: users users_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_email_key UNIQUE (email);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: users users_username_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_username_key UNIQUE (username);


--
-- Name: worker_advances worker_advances_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.worker_advances
    ADD CONSTRAINT worker_advances_pkey PRIMARY KEY (id);


--
-- Name: worker_attendance worker_attendance_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.worker_attendance
    ADD CONSTRAINT worker_attendance_pkey PRIMARY KEY (id);


--
-- Name: worker_attendance worker_attendance_worker_id_date_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.worker_attendance
    ADD CONSTRAINT worker_attendance_worker_id_date_key UNIQUE (worker_id, date);


--
-- Name: worker_free_products worker_free_products_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.worker_free_products
    ADD CONSTRAINT worker_free_products_pkey PRIMARY KEY (id);


--
-- Name: payroll worker_salary_payments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payroll
    ADD CONSTRAINT worker_salary_payments_pkey PRIMARY KEY (id);


--
-- Name: worker_salary_payments worker_salary_payments_pkey1; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.worker_salary_payments
    ADD CONSTRAINT worker_salary_payments_pkey1 PRIMARY KEY (id);


--
-- Name: payroll worker_salary_payments_worker_id_year_month_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payroll
    ADD CONSTRAINT worker_salary_payments_worker_id_year_month_key UNIQUE (worker_id, year, month);


--
-- Name: worker_salary_payments worker_salary_payments_worker_id_year_month_key1; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.worker_salary_payments
    ADD CONSTRAINT worker_salary_payments_worker_id_year_month_key1 UNIQUE (worker_id, year, month);


--
-- Name: workers workers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workers
    ADD CONSTRAINT workers_pkey PRIMARY KEY (id);


--
-- Name: idx_allocations_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_allocations_date ON public.salesperson_allocations USING btree (allocation_date);


--
-- Name: idx_allocations_product; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_allocations_product ON public.salesperson_allocations USING btree (product_id);


--
-- Name: idx_allocations_production; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_allocations_production ON public.salesperson_allocations USING btree (production_id);


--
-- Name: idx_allocations_salesperson; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_allocations_salesperson ON public.salesperson_allocations USING btree (salesperson_id);


--
-- Name: idx_allocations_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_allocations_status ON public.salesperson_allocations USING btree (status);


--
-- Name: idx_bom_inventory; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bom_inventory ON public.product_bom USING btree (inventory_item_id);


--
-- Name: idx_bom_product; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bom_product ON public.product_bom USING btree (product_id);


--
-- Name: idx_buyers_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_buyers_active ON public.buyers USING btree (is_active);


--
-- Name: idx_buyers_coordinates; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_buyers_coordinates ON public.buyers USING btree (latitude, longitude);


--
-- Name: idx_buyers_location; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_buyers_location ON public.buyers USING btree (latitude, longitude) WHERE ((latitude IS NOT NULL) AND (longitude IS NOT NULL));


--
-- Name: idx_cheques_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cheques_date ON public.cheques USING btree (cheque_date);


--
-- Name: idx_cheques_payment; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cheques_payment ON public.cheques USING btree (payment_id);


--
-- Name: idx_cheques_return_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cheques_return_date ON public.cheques USING btree (return_date);


--
-- Name: idx_cheques_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cheques_status ON public.cheques USING btree (status);


--
-- Name: idx_expenses_category; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_expenses_category ON public.expenses USING btree (category);


--
-- Name: idx_expenses_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_expenses_date ON public.expenses USING btree (date);


--
-- Name: idx_expenses_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_expenses_type ON public.expenses USING btree (type);


--
-- Name: idx_farmer_free_products_farmer; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_farmer_free_products_farmer ON public.farmer_free_products USING btree (farmer_id);


--
-- Name: idx_farmer_free_products_issued_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_farmer_free_products_issued_at ON public.farmer_free_products USING btree (issued_at);


--
-- Name: idx_farmer_free_products_month_year; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_farmer_free_products_month_year ON public.farmer_free_products USING btree (year, month);


--
-- Name: idx_farmer_free_products_product; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_farmer_free_products_product ON public.farmer_free_products USING btree (product_id);


--
-- Name: idx_farmers_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_farmers_active ON public.farmers USING btree (is_active);


--
-- Name: idx_farmers_name; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_farmers_name ON public.farmers USING btree (name);


--
-- Name: idx_inventory_batches_batch_number; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_inventory_batches_batch_number ON public.inventory_batches USING btree (batch_number);


--
-- Name: idx_inventory_batches_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_inventory_batches_date ON public.inventory_batches USING btree (production_date);


--
-- Name: idx_inventory_batches_item; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_inventory_batches_item ON public.inventory_batches USING btree (inventory_item_id);


--
-- Name: idx_inventory_batches_production; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_inventory_batches_production ON public.inventory_batches USING btree (production_id);


--
-- Name: idx_inventory_batches_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_inventory_batches_status ON public.inventory_batches USING btree (status);


--
-- Name: idx_inventory_category; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_inventory_category ON public.inventory_items USING btree (category_id);


--
-- Name: idx_inventory_expiry; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_inventory_expiry ON public.inventory_items USING btree (expiry_date) WHERE (expiry_date IS NOT NULL);


--
-- Name: idx_inventory_low_stock; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_inventory_low_stock ON public.inventory_items USING btree (quantity, min_quantity);


--
-- Name: idx_milk_collections_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_milk_collections_date ON public.milk_collections USING btree (date);


--
-- Name: idx_milk_collections_farmer; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_milk_collections_farmer ON public.milk_collections USING btree (farmer_id);


--
-- Name: idx_milk_collections_farmer_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_milk_collections_farmer_date ON public.milk_collections USING btree (farmer_id, date);


--
-- Name: idx_payment_free_items_payment; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_payment_free_items_payment ON public.payment_free_items USING btree (payment_id);


--
-- Name: idx_payment_free_items_product; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_payment_free_items_product ON public.payment_free_items USING btree (product_id);


--
-- Name: idx_payments_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_payments_date ON public.payments USING btree (payment_date);


--
-- Name: idx_payments_sale; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_payments_sale ON public.payments USING btree (sale_id);


--
-- Name: idx_payments_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_payments_status ON public.payments USING btree (status);


--
-- Name: idx_productions_batch; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_productions_batch ON public.productions USING btree (batch);


--
-- Name: idx_productions_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_productions_date ON public.productions USING btree (date);


--
-- Name: idx_productions_date_product; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_productions_date_product ON public.productions USING btree (date, product_id);


--
-- Name: idx_productions_product; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_productions_product ON public.productions USING btree (product_id);


--
-- Name: idx_products_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_products_active ON public.products USING btree (is_active);


--
-- Name: idx_products_category; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_products_category ON public.products USING btree (category);


--
-- Name: idx_returns_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_returns_date ON public.returns USING btree (created_at);


--
-- Name: idx_returns_product; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_returns_product ON public.returns USING btree (product_id);


--
-- Name: idx_returns_sale; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_returns_sale ON public.returns USING btree (sale_id);


--
-- Name: idx_salary_bonus_month_year; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_salary_bonus_month_year ON public.salary_bonus USING btree (year, month);


--
-- Name: idx_salary_bonus_worker; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_salary_bonus_worker ON public.salary_bonus USING btree (worker_id);


--
-- Name: idx_salary_bonus_worker_month_year; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_salary_bonus_worker_month_year ON public.salary_bonus USING btree (worker_id, year, month);


--
-- Name: idx_sale_items_product; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sale_items_product ON public.sale_items USING btree (product_id);


--
-- Name: idx_sale_items_sale; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sale_items_sale ON public.sale_items USING btree (sale_id);


--
-- Name: idx_sales_allocations_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sales_allocations_date ON public.sales_allocations USING btree (allocation_date);


--
-- Name: idx_sales_allocations_product; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sales_allocations_product ON public.sales_allocations USING btree (product_id);


--
-- Name: idx_sales_allocations_production; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sales_allocations_production ON public.sales_allocations USING btree (production_id);


--
-- Name: idx_sales_allocations_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sales_allocations_status ON public.sales_allocations USING btree (status);


--
-- Name: idx_sales_buyer; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sales_buyer ON public.sales USING btree (buyer_id);


--
-- Name: idx_sales_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sales_date ON public.sales USING btree (date);


--
-- Name: idx_sales_date_sold_by; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sales_date_sold_by ON public.sales USING btree (date, sold_by);


--
-- Name: idx_sales_payment_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sales_payment_status ON public.sales USING btree (payment_status);


--
-- Name: idx_sales_salesperson; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sales_salesperson ON public.sales USING btree (salesperson_id);


--
-- Name: idx_sales_sold_by; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sales_sold_by ON public.sales USING btree (sold_by);


--
-- Name: idx_salesperson_inventory_product; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_salesperson_inventory_product ON public.salesperson_inventory USING btree (product_id);


--
-- Name: idx_salesperson_inventory_salesperson; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_salesperson_inventory_salesperson ON public.salesperson_inventory USING btree (salesperson_id);


--
-- Name: idx_salesperson_locations_updated; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_salesperson_locations_updated ON public.salesperson_locations USING btree (last_updated);


--
-- Name: idx_salesperson_locations_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_salesperson_locations_user ON public.salesperson_locations USING btree (user_id);


--
-- Name: idx_settings_key; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_settings_key ON public.settings USING btree (key);


--
-- Name: idx_users_role; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_role ON public.users USING btree (role);


--
-- Name: idx_users_username; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_username ON public.users USING btree (username);


--
-- Name: idx_worker_advances_month_year; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_worker_advances_month_year ON public.worker_advances USING btree (year, month);


--
-- Name: idx_worker_advances_worker; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_worker_advances_worker ON public.worker_advances USING btree (worker_id);


--
-- Name: idx_worker_advances_worker_month_year; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_worker_advances_worker_month_year ON public.worker_advances USING btree (worker_id, year, month);


--
-- Name: idx_worker_attendance_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_worker_attendance_date ON public.worker_attendance USING btree (date);


--
-- Name: idx_worker_attendance_worker; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_worker_attendance_worker ON public.worker_attendance USING btree (worker_id);


--
-- Name: idx_worker_attendance_worker_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_worker_attendance_worker_date ON public.worker_attendance USING btree (worker_id, date);


--
-- Name: idx_worker_free_products_inventory; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_worker_free_products_inventory ON public.worker_free_products USING btree (inventory_item_id);


--
-- Name: idx_worker_free_products_issued_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_worker_free_products_issued_at ON public.worker_free_products USING btree (issued_at);


--
-- Name: idx_worker_free_products_month_year; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_worker_free_products_month_year ON public.worker_free_products USING btree (year, month);


--
-- Name: idx_worker_free_products_product; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_worker_free_products_product ON public.worker_free_products USING btree (product_id);


--
-- Name: idx_worker_free_products_worker; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_worker_free_products_worker ON public.worker_free_products USING btree (worker_id);


--
-- Name: idx_worker_salary_payments_month_year; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_worker_salary_payments_month_year ON public.payroll USING btree (year, month);


--
-- Name: idx_worker_salary_payments_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_worker_salary_payments_status ON public.payroll USING btree (payment_status);


--
-- Name: idx_worker_salary_payments_worker; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_worker_salary_payments_worker ON public.payroll USING btree (worker_id);


--
-- Name: idx_workers_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_workers_active ON public.workers USING btree (is_active);


--
-- Name: idx_workers_name; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_workers_name ON public.workers USING btree (name);


--
-- Name: sale_items check_return_price_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER check_return_price_trigger BEFORE INSERT OR UPDATE ON public.sale_items FOR EACH ROW EXECUTE FUNCTION public.check_return_price();


--
-- Name: cheques update_cheques_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_cheques_updated_at BEFORE UPDATE ON public.cheques FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: expenses update_expenses_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_expenses_updated_at BEFORE UPDATE ON public.expenses FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: farmer_free_products update_farmer_free_products_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_farmer_free_products_updated_at BEFORE UPDATE ON public.farmer_free_products FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: farmers update_farmers_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_farmers_updated_at BEFORE UPDATE ON public.farmers FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: inventory_batches update_inventory_batches_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_inventory_batches_updated_at BEFORE UPDATE ON public.inventory_batches FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: inventory_items update_inventory_items_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_inventory_items_updated_at BEFORE UPDATE ON public.inventory_items FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: payments update_payments_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_payments_updated_at BEFORE UPDATE ON public.payments FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: products update_products_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_products_updated_at BEFORE UPDATE ON public.products FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: returns update_returns_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_returns_updated_at BEFORE UPDATE ON public.returns FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: salary_bonus update_salary_bonus_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_salary_bonus_updated_at BEFORE UPDATE ON public.salary_bonus FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: sales update_sales_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_sales_updated_at BEFORE UPDATE ON public.sales FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: salesperson_allocations update_salesperson_allocations_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_salesperson_allocations_updated_at BEFORE UPDATE ON public.salesperson_allocations FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: salesperson_inventory update_salesperson_inventory_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_salesperson_inventory_updated_at BEFORE UPDATE ON public.salesperson_inventory FOR EACH ROW EXECUTE FUNCTION public.update_salesperson_inventory_timestamp();


--
-- Name: users update_users_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON public.users FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: worker_advances update_worker_advances_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_worker_advances_updated_at BEFORE UPDATE ON public.worker_advances FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: worker_attendance update_worker_attendance_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_worker_attendance_updated_at BEFORE UPDATE ON public.worker_attendance FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: worker_free_products update_worker_free_products_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_worker_free_products_updated_at BEFORE UPDATE ON public.worker_free_products FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: payroll update_worker_salary_payments_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_worker_salary_payments_updated_at BEFORE UPDATE ON public.payroll FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: worker_salary_payments update_worker_salary_payments_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_worker_salary_payments_updated_at BEFORE UPDATE ON public.worker_salary_payments FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: workers update_workers_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_workers_updated_at BEFORE UPDATE ON public.workers FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: cheques cheques_payment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cheques
    ADD CONSTRAINT cheques_payment_id_fkey FOREIGN KEY (payment_id) REFERENCES public.payments(id) ON DELETE CASCADE;


--
-- Name: expenses expenses_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.expenses
    ADD CONSTRAINT expenses_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: farmer_free_products farmer_free_products_farmer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.farmer_free_products
    ADD CONSTRAINT farmer_free_products_farmer_id_fkey FOREIGN KEY (farmer_id) REFERENCES public.farmers(id) ON DELETE CASCADE;


--
-- Name: farmer_free_products farmer_free_products_issued_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.farmer_free_products
    ADD CONSTRAINT farmer_free_products_issued_by_fkey FOREIGN KEY (issued_by) REFERENCES public.users(id);


--
-- Name: farmer_free_products farmer_free_products_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.farmer_free_products
    ADD CONSTRAINT farmer_free_products_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE SET NULL;


--
-- Name: inventory_batches inventory_batches_inventory_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_batches
    ADD CONSTRAINT inventory_batches_inventory_item_id_fkey FOREIGN KEY (inventory_item_id) REFERENCES public.inventory_items(id) ON DELETE CASCADE;


--
-- Name: inventory_batches inventory_batches_production_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_batches
    ADD CONSTRAINT inventory_batches_production_id_fkey FOREIGN KEY (production_id) REFERENCES public.productions(id);


--
-- Name: inventory_items inventory_items_category_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_items
    ADD CONSTRAINT inventory_items_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.inventory_categories(id);


--
-- Name: milk_collections milk_collections_farmer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.milk_collections
    ADD CONSTRAINT milk_collections_farmer_id_fkey FOREIGN KEY (farmer_id) REFERENCES public.farmers(id) ON DELETE CASCADE;


--
-- Name: payment_free_items payment_free_items_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_free_items
    ADD CONSTRAINT payment_free_items_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: payment_free_items payment_free_items_payment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_free_items
    ADD CONSTRAINT payment_free_items_payment_id_fkey FOREIGN KEY (payment_id) REFERENCES public.payments(id) ON DELETE CASCADE;


--
-- Name: payment_free_items payment_free_items_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_free_items
    ADD CONSTRAINT payment_free_items_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id);


--
-- Name: payments payments_sale_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_sale_id_fkey FOREIGN KEY (sale_id) REFERENCES public.sales(id) ON DELETE CASCADE;


--
-- Name: product_bom product_bom_inventory_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_bom
    ADD CONSTRAINT product_bom_inventory_item_id_fkey FOREIGN KEY (inventory_item_id) REFERENCES public.inventory_items(id) ON DELETE CASCADE;


--
-- Name: product_bom product_bom_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_bom
    ADD CONSTRAINT product_bom_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;


--
-- Name: productions productions_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.productions
    ADD CONSTRAINT productions_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: productions productions_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.productions
    ADD CONSTRAINT productions_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id);


--
-- Name: returns returns_processed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.returns
    ADD CONSTRAINT returns_processed_by_fkey FOREIGN KEY (processed_by) REFERENCES public.users(id);


--
-- Name: returns returns_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.returns
    ADD CONSTRAINT returns_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id);


--
-- Name: returns returns_replacement_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.returns
    ADD CONSTRAINT returns_replacement_product_id_fkey FOREIGN KEY (replacement_product_id) REFERENCES public.products(id);


--
-- Name: returns returns_sale_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.returns
    ADD CONSTRAINT returns_sale_id_fkey FOREIGN KEY (sale_id) REFERENCES public.sales(id) ON DELETE CASCADE;


--
-- Name: salary_bonus salary_bonus_worker_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.salary_bonus
    ADD CONSTRAINT salary_bonus_worker_id_fkey FOREIGN KEY (worker_id) REFERENCES public.workers(id) ON DELETE CASCADE;


--
-- Name: sale_items sale_items_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sale_items
    ADD CONSTRAINT sale_items_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id);


--
-- Name: sale_items sale_items_sale_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sale_items
    ADD CONSTRAINT sale_items_sale_id_fkey FOREIGN KEY (sale_id) REFERENCES public.sales(id) ON DELETE CASCADE;


--
-- Name: sales_allocations sales_allocations_allocated_to_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sales_allocations
    ADD CONSTRAINT sales_allocations_allocated_to_fkey FOREIGN KEY (allocated_to) REFERENCES public.users(id);


--
-- Name: sales_allocations sales_allocations_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sales_allocations
    ADD CONSTRAINT sales_allocations_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id);


--
-- Name: sales_allocations sales_allocations_production_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sales_allocations
    ADD CONSTRAINT sales_allocations_production_id_fkey FOREIGN KEY (production_id) REFERENCES public.productions(id) ON DELETE CASCADE;


--
-- Name: sales sales_buyer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sales
    ADD CONSTRAINT sales_buyer_id_fkey FOREIGN KEY (buyer_id) REFERENCES public.buyers(id);


--
-- Name: sales sales_salesperson_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sales
    ADD CONSTRAINT sales_salesperson_id_fkey FOREIGN KEY (salesperson_id) REFERENCES public.users(id);


--
-- Name: salesperson_allocations salesperson_allocations_allocated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.salesperson_allocations
    ADD CONSTRAINT salesperson_allocations_allocated_by_fkey FOREIGN KEY (allocated_by) REFERENCES public.users(id);


--
-- Name: salesperson_allocations salesperson_allocations_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.salesperson_allocations
    ADD CONSTRAINT salesperson_allocations_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id);


--
-- Name: salesperson_allocations salesperson_allocations_production_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.salesperson_allocations
    ADD CONSTRAINT salesperson_allocations_production_id_fkey FOREIGN KEY (production_id) REFERENCES public.productions(id) ON DELETE CASCADE;


--
-- Name: salesperson_allocations salesperson_allocations_salesperson_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.salesperson_allocations
    ADD CONSTRAINT salesperson_allocations_salesperson_id_fkey FOREIGN KEY (salesperson_id) REFERENCES public.users(id);


--
-- Name: salesperson_inventory salesperson_inventory_allocated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.salesperson_inventory
    ADD CONSTRAINT salesperson_inventory_allocated_by_fkey FOREIGN KEY (allocated_by) REFERENCES public.users(id);


--
-- Name: salesperson_inventory salesperson_inventory_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.salesperson_inventory
    ADD CONSTRAINT salesperson_inventory_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;


--
-- Name: salesperson_inventory salesperson_inventory_salesperson_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.salesperson_inventory
    ADD CONSTRAINT salesperson_inventory_salesperson_id_fkey FOREIGN KEY (salesperson_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: salesperson_locations salesperson_locations_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.salesperson_locations
    ADD CONSTRAINT salesperson_locations_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: settings settings_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.settings
    ADD CONSTRAINT settings_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.users(id);


--
-- Name: worker_advances worker_advances_worker_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.worker_advances
    ADD CONSTRAINT worker_advances_worker_id_fkey FOREIGN KEY (worker_id) REFERENCES public.workers(id) ON DELETE CASCADE;


--
-- Name: worker_attendance worker_attendance_worker_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.worker_attendance
    ADD CONSTRAINT worker_attendance_worker_id_fkey FOREIGN KEY (worker_id) REFERENCES public.workers(id) ON DELETE CASCADE;


--
-- Name: worker_free_products worker_free_products_inventory_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.worker_free_products
    ADD CONSTRAINT worker_free_products_inventory_item_id_fkey FOREIGN KEY (inventory_item_id) REFERENCES public.inventory_items(id) ON DELETE SET NULL;


--
-- Name: worker_free_products worker_free_products_issued_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.worker_free_products
    ADD CONSTRAINT worker_free_products_issued_by_fkey FOREIGN KEY (issued_by) REFERENCES public.users(id);


--
-- Name: worker_free_products worker_free_products_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.worker_free_products
    ADD CONSTRAINT worker_free_products_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE SET NULL;


--
-- Name: worker_free_products worker_free_products_worker_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.worker_free_products
    ADD CONSTRAINT worker_free_products_worker_id_fkey FOREIGN KEY (worker_id) REFERENCES public.workers(id) ON DELETE CASCADE;


--
-- Name: payroll worker_salary_payments_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payroll
    ADD CONSTRAINT worker_salary_payments_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: worker_salary_payments worker_salary_payments_created_by_fkey1; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.worker_salary_payments
    ADD CONSTRAINT worker_salary_payments_created_by_fkey1 FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: payroll worker_salary_payments_worker_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payroll
    ADD CONSTRAINT worker_salary_payments_worker_id_fkey FOREIGN KEY (worker_id) REFERENCES public.workers(id) ON DELETE CASCADE;


--
-- Name: worker_salary_payments worker_salary_payments_worker_id_fkey1; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.worker_salary_payments
    ADD CONSTRAINT worker_salary_payments_worker_id_fkey1 FOREIGN KEY (worker_id) REFERENCES public.workers(id) ON DELETE CASCADE;


--
-- PostgreSQL database dump complete
--

\unrestrict Ru6wIpyWi6B0x8rfnIZUPazwQ04GQSwxWegYPN9qqll9YkYG2tEa2ZT9UWKCL0u

