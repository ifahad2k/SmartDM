-- Phase 7: Categories and Rules

CREATE TABLE category (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    default_destination_path TEXT
);

CREATE TABLE category_rule (
    category_id TEXT NOT NULL,
    rule_type TEXT NOT NULL,
    rule_value TEXT NOT NULL,
    FOREIGN KEY (category_id) REFERENCES category(id) ON DELETE CASCADE
);

-- Default categories
INSERT INTO category (id, name) VALUES ('compressed', 'Compressed');
INSERT INTO category (id, name) VALUES ('documents', 'Documents');
INSERT INTO category (id, name) VALUES ('music', 'Music');
INSERT INTO category (id, name) VALUES ('programs', 'Programs');
INSERT INTO category (id, name) VALUES ('video', 'Video');
INSERT INTO category (id, name) VALUES ('images', 'Images');
INSERT INTO category (id, name) VALUES ('other', 'Other');

-- Add category reference to download
ALTER TABLE download ADD COLUMN category_id TEXT REFERENCES category(id);
