package io.smartdm.platform.testkit;

import java.io.PrintStream;
import java.util.Arrays;

public final class ProcessFixtureMain {

    public static void main(String[] args) throws Exception {
        if (args.length == 0) {
            throw new IllegalArgumentException("Mode required");
        }
        
        switch (args[0]) {
            case "sleep" -> Thread.sleep(Long.parseLong(args[1]));
            case "stdout" -> spam(System.out, args);
            case "stderr" -> spam(System.err, args);
            case "exit" -> System.exit(Integer.parseInt(args[1]));
            case "echo-args" -> {
                for (int i = 1; i < args.length; i++) {
                    System.out.println(args[i]);
                }
            }
            case "spawn-child" -> spawnChild(args);
            default -> throw new IllegalArgumentException("Unknown mode: " + args[0]);
        }
    }

    private static void spam(PrintStream out, String[] args) {
        int count = Integer.parseInt(args[1]);
        int size = Integer.parseInt(args[2]);
        char[] chars = new char[size];
        Arrays.fill(chars, 'a');
        String line = new String(chars);
        for (int i = 0; i < count; i++) {
            out.println(line);
        }
    }

    private static void spawnChild(String[] args) throws Exception {
        long sleepTime = Long.parseLong(args[1]);
        String javaHome = System.getProperty("java.home");
        String javaBin = javaHome + java.io.File.separator + "bin" + java.io.File.separator + "java";
        String classpath = System.getProperty("java.class.path");
        String className = ProcessFixtureMain.class.getName();

        ProcessBuilder builder = new ProcessBuilder(javaBin, "-cp", classpath, className, "sleep", String.valueOf(sleepTime));
        builder.inheritIO();
        Process child = builder.start();
        
        // Wait for child indefinitely, unless we get killed
        child.waitFor();
    }
}
