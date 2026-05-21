import { createApp } from "./app.js";
import { env } from "./shared/config/env.js";

const app = createApp();

app.listen(env.PORT, () => {
  console.log(`Notification Hub API listening on port ${env.PORT}`);
});
