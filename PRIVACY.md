# Privacy policy

inline-images runs entirely on the machine where Claude Code runs. It has no server
and collects no telemetry. Nothing it reads is sent to the author or to any third
party.

## What it reads

* Image files whose paths Claude Code shows: files Claude sends you or reads, and
  image paths in messages and shell output, when you click them open. It checks that
  such a path exists before showing a line for it.
* The image data already in the conversation for images Claude reads and images you
  paste, through the plugin API.
* `~/.cache/inline-images/inbox/`, for paths a hotkey or script asks it to show.

## What it writes

It empties its inbox file after taking a request. It keeps decoded images in memory
for the session and writes nothing else.

## Where the pixels go

To your terminal, in the same output stream as everything else Claude Code draws.
Over ssh that is the ssh connection you already have.

## Contact

Questions go to [GitHub issues](https://github.com/nnemirovsky/cc-inline-images/issues).
