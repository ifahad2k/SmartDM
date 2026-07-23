package io.smartdm.platform.api.process;

import java.io.InputStream;
import java.util.Optional;

public interface NativeProcessHandle {
    long pid();
    InputStream getInputStream();
    InputStream getErrorStream();
    
    /**
     * Gracefully terminate the process.
     */
    void terminate();
    
    /**
     * Forcibly terminate the process.
     */
    void terminateForcibly();
    
    /**
     * Terminate this process and all of its descendants.
     */
    void killTree();
    
    /**
     * Wait for the process to finish.
     * @return the exit code
     * @throws InterruptedException if interrupted while waiting
     */
    int waitFor() throws InterruptedException;
    
    boolean isAlive();
}
