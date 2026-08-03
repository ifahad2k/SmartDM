package io.smartdm.ai.api;

/**
 * Categories of allowed AI tasks in SmartDM.
 */
public enum AiTask {
    QUERY_PARSING("Search Query Interpretation"),
    FOLDER_CLASSIFICATION("Folder Organization Recommendation"),
    SAFETY_EXPLANATION("Safety Warning Explanation");

    private final String displayName;

    AiTask(String displayName) {
        this.displayName = displayName;
    }

    public String displayName() {
        return displayName;
    }
}
