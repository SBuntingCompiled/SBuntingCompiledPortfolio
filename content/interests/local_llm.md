---
title: AI / Local LLM
---

Like many I utilize AI in my everyday workflows. However, I wanted to embark on a project
that would help me understand better what is going on under the hood as well as get a 
solid understanding of the difference between LLM vs agent. As I go through this 
process I will try my best to document my learning and explain these terms. 

To start this journey off I elected to setup a Raspberry Pi 4 with Raspberry Pi OS Lite as
a headless setup is perfect for this. After getting the OS setup I decided to go with Ollama
which as an open source framework that lets you run LLMs. One of the models you can run that
works well on the Raspberry Pi is called "tinyllama". So, for my first LLM I elected to go 
with that and what you see below is how it looks when providing it a simple prompt.  

![tinyllama](/images/ollama_prompt.png)

From here I plan to investigate other viable models to run on the Raspberry Pi and evaluate
which will be the best to use for specific tasks such as coding, writing, and broader
general use. 