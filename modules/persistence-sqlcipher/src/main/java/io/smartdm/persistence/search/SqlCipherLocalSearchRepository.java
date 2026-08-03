package io.smartdm.persistence.search;

import io.smartdm.domain.search.*;
import io.smartdm.domain.repository.LocalSearchRepository;
import io.smartdm.persistence.SqlCipherDatabase;

import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

public class SqlCipherLocalSearchRepository implements LocalSearchRepository {
    private final SqlCipherDatabase database;

    public SqlCipherLocalSearchRepository(SqlCipherDatabase database) {
        this.database = database;
    }

    @Override
    public List<LocalSearchResult> executeSearch(LocalSearchPlan plan, int limit, int offset) {
        StringBuilder sql = new StringBuilder();
        List<Object> params = new ArrayList<>();

        sql.append("WITH unified AS ( ");
        
        // 1. Catalog part
        sql.append("SELECT c.id AS id, c.file_name AS name, c.relative_path AS path, c.file_size AS size_bytes, c.created_at AS date, ")
           .append("c.file_extension AS ext, c.mime_type AS mime, 'CATALOG' as source, NULL as source_host, ")
           .append("c.rowid as rowid ")
           .append("FROM catalog_file c ");
        
        boolean hasText = plan.text().isPresent() && !plan.text().get().isBlank();
        if (hasText) {
            sql.append("JOIN catalog_file_fts fts ON c.rowid = fts.rowid ");
        }
        
        sql.append("WHERE 1=1 ");
        
        if (hasText) {
            sql.append("AND catalog_file_fts MATCH ? ");
            // Sanitize query to avoid FTS syntax errors
            String sanitizedQuery = plan.text().get().replaceAll("[\"'\\[\\]()*!^~-]", " ");
            params.add("\"" + sanitizedQuery.trim() + "\"*");
        }
        
        appendFilters(sql, params, plan, "c.file_size", "c.created_at", "c.file_extension", "c.mime_type", true);

        sql.append(" UNION ALL ");

        // 2. Download part
        sql.append("SELECT d.id AS id, d.destination_path AS name, d.destination_path AS path, d.total_bytes AS size_bytes, d.created_at AS date, ")
           .append("'' AS ext, '' AS mime, 'DOWNLOAD' as source, d.source_uri as source_host, ")
           .append("d.rowid as rowid ")
           .append("FROM download d ");
        
        sql.append("WHERE 1=1 ");
        if (hasText) {
            sql.append("AND d.destination_path LIKE ? ");
            params.add("%" + plan.text().get() + "%");
        }

        appendFilters(sql, params, plan, "d.total_bytes", "d.created_at", null, null, false);
        
        sql.append(") SELECT * FROM unified ORDER BY ");
        
        switch (plan.sortOrder()) {
            case DATE_DESC -> sql.append("date DESC");
            case DATE_ASC -> sql.append("date ASC");
            case SIZE_DESC -> sql.append("size_bytes DESC");
            case SIZE_ASC -> sql.append("size_bytes ASC");
            case NAME_ASC -> sql.append("name ASC");
            case NAME_DESC -> sql.append("name DESC");
            case RELEVANCE -> sql.append("name ASC"); // Since UNION has no global relevance
        }
        
        sql.append(" LIMIT ? OFFSET ?");
        params.add(limit);
        params.add(offset);

        List<LocalSearchResult> results = new ArrayList<>();
        try (Connection conn = database.getConnection();
             PreparedStatement stmt = conn.prepareStatement(sql.toString())) {
             
            for (int i = 0; i < params.size(); i++) {
                stmt.setObject(i + 1, params.get(i));
            }
            
            try (ResultSet rs = stmt.executeQuery()) {
                while (rs.next()) {
                    Instant date = null;
                    String dateStr = rs.getString("date");
                    if (dateStr != null) {
                        try {
                            date = Instant.parse(dateStr.endsWith("Z") ? dateStr : dateStr + "Z");
                        } catch (Exception ignored) {
                        }
                    }
                    
                    FileKind kind = FileKind.UNKNOWN;
                    String sourceHost = rs.getString("source_host");
                    if (sourceHost != null && sourceHost.length() > 0) {
                        try {
                            java.net.URI uri = java.net.URI.create(sourceHost);
                            sourceHost = uri.getHost();
                        } catch (Exception ignored) {}
                    }
                    
                    results.add(new LocalSearchResult(
                        rs.getString("id"),
                        rs.getString("name"),
                        rs.getString("path"),
                        rs.getLong("size_bytes"),
                        date,
                        kind,
                        sourceHost,
                        "Matched query",
                        "DOWNLOAD".equals(rs.getString("source"))
                    ));
                }
            }
        } catch (SQLException e) {
            throw new RuntimeException("Failed to execute search", e);
        }
        
        return results;
    }

    private void appendFilters(StringBuilder sql, List<Object> params, LocalSearchPlan plan, String sizeCol, String dateCol, String extCol, String mimeCol, boolean isCatalog) {
        if (plan.sizeBytes().isPresent()) {
            LongRange sr = plan.sizeBytes().get();
            if (sr.min() != null) {
                sql.append(" AND ").append(sizeCol).append(" >= ?");
                params.add(sr.min());
            }
            if (sr.max() != null) {
                sql.append(" AND ").append(sizeCol).append(" <= ?");
                params.add(sr.max());
            }
        }
        if (plan.dateRange().isPresent()) {
            InstantRange dr = plan.dateRange().get();
            if (dr.start() != null) {
                sql.append(" AND ").append(dateCol).append(" >= ?");
                params.add(dr.start().toString());
            }
            if (dr.end() != null) {
                sql.append(" AND ").append(dateCol).append(" <= ?");
                params.add(dr.end().toString());
            }
        }
        if (isCatalog && plan.kinds() != null && !plan.kinds().isEmpty()) {
            // Very simplified FileKind mapping for SQLite
            sql.append(" AND (");
            boolean first = true;
            for (FileKind kind : plan.kinds()) {
                if (!first) sql.append(" OR ");
                switch (kind) {
                    case VIDEO -> sql.append("mime_type LIKE 'video/%'");
                    case AUDIO -> sql.append("mime_type LIKE 'audio/%'");
                    case DOCUMENT -> sql.append("mime_type LIKE 'application/pdf' OR mime_type LIKE 'text/%'");
                    case IMAGE -> sql.append("mime_type LIKE 'image/%'");
                    case ARCHIVE -> sql.append("mime_type LIKE 'application/zip' OR mime_type LIKE 'application/x-tar'");
                    case EXECUTABLE -> sql.append("mime_type LIKE 'application/x-msdownload'");
                    default -> sql.append("1=1");
                }
                first = false;
            }
            sql.append(") ");
        }
    }
}
