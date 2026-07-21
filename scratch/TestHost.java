import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;

public class TestHost {
    public static void main(String[] args) throws Exception {
        ProcessBuilder pb = new ProcessBuilder("cmd", "/c", "E:\\skill\\projects\\smartdm\\extensions\\chrome\\host\\host.bat");
        Process p = pb.start();
        
        OutputStream out = p.getOutputStream();
        InputStream in = p.getInputStream();
        InputStream err = p.getErrorStream();
        
        String json = "{\"type\":\"ADD_DOWNLOAD\",\"url\":\"https://example.com/sample.zip\",\"fileName\":null,\"referer\":null,\"userAgent\":\"TestAgent\"}";
        byte[] bytes = json.getBytes(StandardCharsets.UTF_8);
        int len = bytes.length;
        out.write(new byte[]{ (byte)(len & 0xFF), (byte)((len>>8)&0xFF), (byte)((len>>16)&0xFF), (byte)((len>>24)&0xFF) });
        out.write(bytes);
        out.flush();
        
        byte[] lenBuf = new byte[4];
        int read = in.read(lenBuf);
        if (read == 4) {
            int respLen = (lenBuf[0]&0xFF) | ((lenBuf[1]&0xFF)<<8) | ((lenBuf[2]&0xFF)<<16) | ((lenBuf[3]&0xFF)<<24);
            byte[] respBuf = new byte[respLen];
            in.read(respBuf);
            System.out.println("RESPONSE: " + new String(respBuf, StandardCharsets.UTF_8));
        } else {
            System.out.println("NO RESPONSE READ: " + read);
            System.out.println("STDERR: " + new String(err.readAllBytes(), StandardCharsets.UTF_8));
        }
        
        p.destroy();
    }
}
