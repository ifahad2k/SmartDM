-- V13: Add FTS triggers on catalog_file to keep catalog_file_fts synchronized

CREATE TRIGGER IF NOT EXISTS catalog_file_ai AFTER INSERT ON catalog_file BEGIN
    INSERT INTO catalog_file_fts(rowid, file_name, relative_path, file_extension)
    VALUES (new.rowid, new.file_name, new.relative_path, new.file_extension);
END;

CREATE TRIGGER IF NOT EXISTS catalog_file_ad AFTER DELETE ON catalog_file BEGIN
    INSERT INTO catalog_file_fts(catalog_file_fts, rowid, file_name, relative_path, file_extension)
    VALUES ('delete', old.rowid, old.file_name, old.relative_path, old.file_extension);
END;

CREATE TRIGGER IF NOT EXISTS catalog_file_au AFTER UPDATE ON catalog_file BEGIN
    INSERT INTO catalog_file_fts(catalog_file_fts, rowid, file_name, relative_path, file_extension)
    VALUES ('delete', old.rowid, old.file_name, old.relative_path, old.file_extension);
    INSERT INTO catalog_file_fts(rowid, file_name, relative_path, file_extension)
    VALUES (new.rowid, new.file_name, new.relative_path, new.file_extension);
END;
