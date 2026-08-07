import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.JsonNode;
import java.util.ArrayList;
import java.util.List;

public class TestParsing {
    public static void main(String[] args) {
        String formatsJson = "[{\"formatId\":\"308\",\"ext\":\"webm\",\"resolution\":\"2560x1440\",\"formatNote\":\"1440p60\",\"fileSize\":2862757060,\"vcodec\":\"vp9\",\"acodec\":\"none\",\"tbr\":12007.164,\"fps\":60,\"isAudioOnly\":false,\"isVideoOnly\":true,\"displayName\":\"2560x1440 60fps (1440p60) - 2.7 GB\",\"formattedSize\":\"2.7 GB\"}]";
        try {
            ObjectMapper mapper = new ObjectMapper();
            JsonNode formatArr = mapper.readTree(formatsJson);
            List<String> parsedFormats = new ArrayList<>();
            for (JsonNode fNode : formatArr) {
                String fid = fNode.has("formatId") ? fNode.get("formatId").asText() : "unknown";
                parsedFormats.add(fid);
            }
            System.out.println("Parsed: " + parsedFormats.size());
        } catch (Exception ex) {
            ex.printStackTrace();
        }
    }
}
