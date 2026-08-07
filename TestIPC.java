import java.io.OutputStream;
import java.net.Socket;
import java.nio.charset.StandardCharsets;

public class TestIPC {
    public static void main(String[] args) throws Exception {
        String json = "{\n" +
            "  \"type\": \"START_MEDIA_DOWNLOAD\",\n" +
            "  \"url\": \"https://www.youtube.com/watch?v=TEST\",\n" +
            "  \"videoUrl\": \"https://www.youtube.com/watch?v=TEST\",\n" +
            "  \"formatId\": \"137\",\n" +
            "  \"title\": \"Test IPC Video\",\n" +
            "  \"formatsJson\": \"[{\\\"formatId\\\":\\\"137\\\",\\\"ext\\\":\\\"mp4\\\",\\\"resolution\\\":\\\"1080p\\\",\\\"formatNote\\\":\\\"1080p\\\",\\\"fileSize\\\":1024,\\\"fps\\\":60,\\\"isAudioOnly\\\":false,\\\"isVideoOnly\\\":false}]\"\n" +
            "}\n";
            
        try (Socket socket = new Socket("127.0.0.1", 21015)) { // SmartDM port is 21015 usually? Wait, let's check port
            OutputStream out = socket.getOutputStream();
            out.write(json.getBytes(StandardCharsets.UTF_8));
            out.flush();
            System.out.println("Sent!");
        }
    }
}
