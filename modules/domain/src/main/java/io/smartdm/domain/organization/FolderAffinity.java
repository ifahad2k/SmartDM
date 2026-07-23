package io.smartdm.domain.organization;

import java.nio.file.Path;

public class FolderAffinity {

    private final Path folderPath;
    private String categoryId;
    private String extensionAffinity;
    private String sourceHostAffinity;
    private int choiceCount;
    private long lastUsedAt;
    private boolean isPinned;
    private boolean isBlacklisted;

    public FolderAffinity(Path folderPath, String categoryId, String extensionAffinity, String sourceHostAffinity, int choiceCount, long lastUsedAt, boolean isPinned, boolean isBlacklisted) {
        this.folderPath = folderPath;
        this.categoryId = categoryId;
        this.extensionAffinity = extensionAffinity;
        this.sourceHostAffinity = sourceHostAffinity;
        this.choiceCount = choiceCount;
        this.lastUsedAt = lastUsedAt;
        this.isPinned = isPinned;
        this.isBlacklisted = isBlacklisted;
    }

    public Path getFolderPath() { return folderPath; }
    public String getCategoryId() { return categoryId; }
    public void setCategoryId(String categoryId) { this.categoryId = categoryId; }
    public String getExtensionAffinity() { return extensionAffinity; }
    public void setExtensionAffinity(String extensionAffinity) { this.extensionAffinity = extensionAffinity; }
    public String getSourceHostAffinity() { return sourceHostAffinity; }
    public void setSourceHostAffinity(String sourceHostAffinity) { this.sourceHostAffinity = sourceHostAffinity; }
    public int getChoiceCount() { return choiceCount; }
    public void setChoiceCount(int choiceCount) { this.choiceCount = choiceCount; }
    public void incrementChoiceCount() { this.choiceCount++; }
    public long getLastUsedAt() { return lastUsedAt; }
    public void setLastUsedAt(long lastUsedAt) { this.lastUsedAt = lastUsedAt; }
    public boolean isPinned() { return isPinned; }
    public void setPinned(boolean pinned) { isPinned = pinned; }
    public boolean isBlacklisted() { return isBlacklisted; }
    public void setBlacklisted(boolean blacklisted) { isBlacklisted = blacklisted; }
}
