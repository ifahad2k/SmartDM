System.out.println("Cannot write to C:\\Users\\Admin\\Downloads\\file.txt".replaceAll("(?i)(?:[a-z]:\\\\\\\\|/home/[^/]+|/Users/[^/]+)[^\\\\s]+", "[REDACTED_PATH]"));
