import io.smartdm.media.ytdlp.*;
import io.smartdm.media.api.*;
import java.util.concurrent.TimeUnit;

public class TestExt {
    public static void main(String[] args) throws Exception {
        LocalMediaToolManager mgr = new LocalMediaToolManager();
        YtDlpExtractor ext = new YtDlpExtractor(mgr);
        long start = System.currentTimeMillis();
        System.out.println("Starting extraction for Facebook WITH COOKIES...");
        try {
            MediaMetadata meta = ext.extractMetadataAsync("https://www.facebook.com/reel/1088269967037803", "c_user=12345; xs=67890;", null).get(45, TimeUnit.SECONDS);
            if (meta != null && !meta.formats().isEmpty()) {
                System.out.println("Success! Formats: " + meta.formats().size());
            } else {
                System.out.println("Meta is null or empty formats!");
            }
        } catch (Exception e) {
            e.printStackTrace();
        }
        System.out.println("Took: " + (System.currentTimeMillis() - start) + "ms");
    }
}
