/**
 * What the file picker will let you choose.
 *
 * `accept="audio/*"` is not enough on a phone. The wildcard is matched against
 * the MIME type the *operating system* claims for a file, and the iOS Files app
 * resolves it to a narrow set of UTIs — so an ordinary .mp3 or .wav sitting in
 * iCloud Drive greys out and cannot be picked at all. Android file providers
 * have the same failure with a claimed type of `application/octet-stream`,
 * which is common for files that arrived over Bluetooth or a download.
 *
 * Listing extensions alongside the wildcard fixes it: the picker unions the two
 * rules, so anything matching either is selectable. The wildcard still carries
 * formats not named here.
 *
 * Both shells import these so the phone and the rack cannot drift apart on what
 * counts as a loadable file.
 */
export const AUDIO_FILE_ACCEPT =
  'audio/*,.mp3,.wav,.wave,.m4a,.aac,.flac,.ogg,.oga,.opus,.aif,.aiff,.mp4,.weba';

export const VIDEO_FILE_ACCEPT =
  'video/*,.mp4,.m4v,.mov,.webm,.mkv,.avi,.mpg,.mpeg,.3gp,.qt';
