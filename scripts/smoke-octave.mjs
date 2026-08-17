const endpoints = [
  "https://music.octavestreaming.com/",
  "https://music.octavestreaming.com/search",
  "https://octavestreaming.com/about",
];

for (const url of endpoints) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetch(url, { signal: controller.signal, redirect: "follow" });
    if (!response.ok) throw new Error(`${url} returned ${response.status}`);
    console.log(`ok ${response.status} ${url}`);
  } finally {
    clearTimeout(timer);
  }
}
