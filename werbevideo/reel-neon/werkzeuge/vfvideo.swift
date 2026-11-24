// vfvideo – Kodieren, Muxen und Prüfen mit AVFoundation (kein ffmpeg).
//   vfvideo encode <bilderordner> <fps> <ausgabe.mp4> <bitrate>     JPEG/PNG-Folge (frame-00000.jpg …) → H.264 (ohne Ton)
//   vfvideo mux <video.mp4> <ton.wav> <ausgabe.mp4>                  Video unverändert übernehmen + Ton als AAC 48 kHz Stereo
//   vfvideo check <video.mp4> <stillordner> <t1> <t2> …              Kenndaten ausgeben + Standbilder still-01.jpg …
import AVFoundation
import CoreGraphics
import CoreMedia
import Foundation
import ImageIO
import UniformTypeIdentifiers

func fail(_ msg: String) -> Never {
  FileHandle.standardError.write((msg + "\n").data(using: .utf8)!)
  exit(1)
}

func loadImage(_ url: URL) -> CGImage? {
  guard let src = CGImageSourceCreateWithURL(url as CFURL, nil) else { return nil }
  return CGImageSourceCreateImageAtIndex(src, 0, [kCGImageSourceShouldCache: false] as CFDictionary)
}

func encode(dir: String, fps: Int32, out: String, bitrate: Int) {
  let fm = FileManager.default
  let files = (try? fm.contentsOfDirectory(atPath: dir))?.filter { $0.hasPrefix("frame-") }.sorted() ?? []
  guard !files.isEmpty, let first = loadImage(URL(fileURLWithPath: dir).appendingPathComponent(files[0])) else {
    fail("Keine Bilder in \(dir)")
  }
  let w = first.width, h = first.height
  let outURL = URL(fileURLWithPath: out)
  try? fm.removeItem(at: outURL)
  guard let writer = try? AVAssetWriter(outputURL: outURL, fileType: .mp4) else { fail("AVAssetWriter") }
  let settings: [String: Any] = [
    AVVideoCodecKey: AVVideoCodecType.h264,
    AVVideoWidthKey: w, AVVideoHeightKey: h,
    AVVideoColorPropertiesKey: [
      AVVideoColorPrimariesKey: AVVideoColorPrimaries_ITU_R_709_2,
      AVVideoTransferFunctionKey: AVVideoTransferFunction_ITU_R_709_2,
      AVVideoYCbCrMatrixKey: AVVideoYCbCrMatrix_ITU_R_709_2,
    ],
    AVVideoCompressionPropertiesKey: [
      AVVideoAverageBitRateKey: bitrate,
      AVVideoProfileLevelKey: AVVideoProfileLevelH264HighAutoLevel,
      AVVideoMaxKeyFrameIntervalKey: Int(fps) * 2,
      AVVideoExpectedSourceFrameRateKey: Int(fps),
      AVVideoAllowFrameReorderingKey: true,
      AVVideoH264EntropyModeKey: AVVideoH264EntropyModeCABAC,
    ],
  ]
  let input = AVAssetWriterInput(mediaType: .video, outputSettings: settings)
  input.expectsMediaDataInRealTime = false
  let adaptor = AVAssetWriterInputPixelBufferAdaptor(assetWriterInput: input, sourcePixelBufferAttributes: [
    kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA,
    kCVPixelBufferWidthKey as String: w, kCVPixelBufferHeightKey as String: h,
    kCVPixelBufferCGImageCompatibilityKey as String: true,
    kCVPixelBufferCGBitmapContextCompatibilityKey as String: true,
  ])
  writer.add(input)
  writer.startWriting()
  writer.startSession(atSourceTime: .zero)
  let space = CGColorSpace(name: CGColorSpace.sRGB)!
  for (i, name) in files.enumerated() {
    autoreleasepool {
      while !input.isReadyForMoreMediaData { Thread.sleep(forTimeInterval: 0.002) }
      guard let img = loadImage(URL(fileURLWithPath: dir).appendingPathComponent(name)) else { fail("Bild \(name)") }
      var pb: CVPixelBuffer?
      CVPixelBufferPoolCreatePixelBuffer(nil, adaptor.pixelBufferPool!, &pb)
      guard let buf = pb else { fail("PixelBuffer") }
      CVPixelBufferLockBaseAddress(buf, [])
      let ctx = CGContext(data: CVPixelBufferGetBaseAddress(buf), width: w, height: h, bitsPerComponent: 8,
                          bytesPerRow: CVPixelBufferGetBytesPerRow(buf), space: space,
                          bitmapInfo: CGImageAlphaInfo.premultipliedFirst.rawValue | CGBitmapInfo.byteOrder32Little.rawValue)!
      ctx.draw(img, in: CGRect(x: 0, y: 0, width: w, height: h))
      CVPixelBufferUnlockBaseAddress(buf, [])
      CVBufferSetAttachment(buf, kCVImageBufferColorPrimariesKey, kCVImageBufferColorPrimaries_ITU_R_709_2, .shouldPropagate)
      CVBufferSetAttachment(buf, kCVImageBufferTransferFunctionKey, kCVImageBufferTransferFunction_ITU_R_709_2, .shouldPropagate)
      CVBufferSetAttachment(buf, kCVImageBufferYCbCrMatrixKey, kCVImageBufferYCbCrMatrix_ITU_R_709_2, .shouldPropagate)
      if !adaptor.append(buf, withPresentationTime: CMTime(value: CMTimeValue(i), timescale: fps)) {
        fail("append \(i): \(writer.error?.localizedDescription ?? "?")")
      }
    }
  }
  input.markAsFinished()
  writer.endSession(atSourceTime: CMTime(value: CMTimeValue(files.count), timescale: fps))
  let sem = DispatchSemaphore(value: 0)
  writer.finishWriting { sem.signal() }
  sem.wait()
  if writer.status != .completed { fail("Kodieren fehlgeschlagen: \(writer.error?.localizedDescription ?? "?")") }
  print("encode ok \(files.count) Bilder \(w)x\(h) → \(out)")
}

func mux(video: String, audio: String, out: String) async {
  let vAsset = AVURLAsset(url: URL(fileURLWithPath: video))
  let aAsset = AVURLAsset(url: URL(fileURLWithPath: audio))
  guard let vTrack = try? await vAsset.loadTracks(withMediaType: .video).first,
        let aTrack = try? await aAsset.loadTracks(withMediaType: .audio).first else { fail("Spuren fehlen") }
  let vDuration = (try? await vAsset.load(.duration)) ?? .zero
  let fmt = (try? await vTrack.load(.formatDescriptions))?.first
  let outURL = URL(fileURLWithPath: out)
  try? FileManager.default.removeItem(at: outURL)
  guard let vReader = try? AVAssetReader(asset: vAsset), let aReader = try? AVAssetReader(asset: aAsset),
        let writer = try? AVAssetWriter(outputURL: outURL, fileType: .mp4) else { fail("Reader/Writer") }
  let vOut = AVAssetReaderTrackOutput(track: vTrack, outputSettings: nil)
  let aOut = AVAssetReaderTrackOutput(track: aTrack, outputSettings: [
    AVFormatIDKey: kAudioFormatLinearPCM, AVLinearPCMBitDepthKey: 16, AVLinearPCMIsFloatKey: false,
    AVLinearPCMIsBigEndianKey: false, AVLinearPCMIsNonInterleaved: false, AVSampleRateKey: 48000, AVNumberOfChannelsKey: 2,
  ])
  vReader.add(vOut)
  aReader.add(aOut)
  let vIn = AVAssetWriterInput(mediaType: .video, outputSettings: nil, sourceFormatHint: fmt)
  var layout = AudioChannelLayout()
  layout.mChannelLayoutTag = kAudioChannelLayoutTag_Stereo
  let aIn = AVAssetWriterInput(mediaType: .audio, outputSettings: [
    AVFormatIDKey: kAudioFormatMPEG4AAC, AVSampleRateKey: 48000, AVNumberOfChannelsKey: 2, AVEncoderBitRateKey: 320_000,
    AVChannelLayoutKey: Data(bytes: &layout, count: MemoryLayout<AudioChannelLayout>.size),
  ])
  vIn.expectsMediaDataInRealTime = false
  aIn.expectsMediaDataInRealTime = false
  writer.add(vIn)
  writer.add(aIn)
  vReader.startReading()
  aReader.startReading()
  writer.startWriting()
  writer.startSession(atSourceTime: .zero)
  let group = DispatchGroup()
  let vq = DispatchQueue(label: "v"), aq = DispatchQueue(label: "a")
  group.enter()
  vIn.requestMediaDataWhenReady(on: vq) {
    while vIn.isReadyForMoreMediaData {
      if let sb = vOut.copyNextSampleBuffer() { vIn.append(sb) } else { vIn.markAsFinished(); group.leave(); return }
    }
  }
  group.enter()
  aIn.requestMediaDataWhenReady(on: aq) {
    while aIn.isReadyForMoreMediaData {
      if let sb = aOut.copyNextSampleBuffer() {
        let pts = CMSampleBufferGetPresentationTimeStamp(sb)
        if CMTimeCompare(pts, vDuration) >= 0 { aIn.markAsFinished(); group.leave(); return }
        aIn.append(sb)
      } else { aIn.markAsFinished(); group.leave(); return }
    }
  }
  group.wait()
  writer.endSession(atSourceTime: vDuration)
  await writer.finishWriting()
  if writer.status != .completed { fail("Muxen fehlgeschlagen: \(writer.error?.localizedDescription ?? "?")") }
  print("mux ok → \(out)")
}

func check(video: String, stills: String, times: [Double]) async {
  let asset = AVURLAsset(url: URL(fileURLWithPath: video))
  let dur = (try? await asset.load(.duration)) ?? .zero
  var info: [String: Any] = ["datei": video, "dauer_s": CMTimeGetSeconds(dur)]
  let size = (try? FileManager.default.attributesOfItem(atPath: video)[.size] as? Int) ?? 0
  info["groesse_bytes"] = size
  if let v = try? await asset.loadTracks(withMediaType: .video).first {
    let (natural, fps, rate, fd) = try! await v.load(.naturalSize, .nominalFrameRate, .estimatedDataRate, .formatDescriptions)
    let codec = fd.first.map { CMFormatDescriptionGetMediaSubType($0) } ?? 0
    let fourcc = String(bytes: [UInt8((codec >> 24) & 255), UInt8((codec >> 16) & 255), UInt8((codec >> 8) & 255), UInt8(codec & 255)], encoding: .ascii) ?? "?"
    let vdur = (try? await v.load(.timeRange))?.duration ?? .zero
    info["video"] = ["breite": natural.width, "hoehe": natural.height, "fps": fps, "mbit_s": Double(rate) / 1e6, "codec": fourcc, "dauer_s": CMTimeGetSeconds(vdur)]
  }
  if let a = try? await asset.loadTracks(withMediaType: .audio).first {
    let (fd, rate) = try! await a.load(.formatDescriptions, .estimatedDataRate)
    var aInfo: [String: Any] = ["kbit_s": Double(rate) / 1000]
    if let f = fd.first, let asbd = CMAudioFormatDescriptionGetStreamBasicDescription(f)?.pointee {
      aInfo["samplerate"] = asbd.mSampleRate
      aInfo["kanaele"] = asbd.mChannelsPerFrame
      aInfo["format"] = asbd.mFormatID == kAudioFormatMPEG4AAC ? "AAC" : String(asbd.mFormatID)
    }
    let adur = (try? await a.load(.timeRange))?.duration ?? .zero
    aInfo["dauer_s"] = CMTimeGetSeconds(adur)
    info["ton"] = aInfo
  }
  let json = try! JSONSerialization.data(withJSONObject: info, options: [.prettyPrinted, .sortedKeys])
  print(String(data: json, encoding: .utf8)!)
  guard !times.isEmpty else { return }
  try? FileManager.default.createDirectory(atPath: stills, withIntermediateDirectories: true)
  let gen = AVAssetImageGenerator(asset: asset)
  gen.requestedTimeToleranceBefore = .zero
  gen.requestedTimeToleranceAfter = .zero
  gen.appliesPreferredTrackTransform = true
  for (i, t) in times.enumerated() {
    let time = CMTime(seconds: t, preferredTimescale: 600)
    guard let (img, _) = try? await gen.image(at: time) else { print("Standbild \(t) fehlgeschlagen"); continue }
    let url = URL(fileURLWithPath: stills).appendingPathComponent(String(format: "still-%02d.jpg", i + 1))
    let dest = CGImageDestinationCreateWithURL(url as CFURL, UTType.jpeg.identifier as CFString, 1, nil)!
    CGImageDestinationAddImage(dest, img, [kCGImageDestinationLossyCompressionQuality: 0.9] as CFDictionary)
    CGImageDestinationFinalize(dest)
    print(String(format: "still-%02d.jpg  t=%.2f s", i + 1, t))
  }
}

let args = CommandLine.arguments
guard args.count >= 2 else { fail("vfvideo encode|mux|check …") }
switch args[1] {
case "encode":
  guard args.count == 6 else { fail("vfvideo encode <ordner> <fps> <aus.mp4> <bitrate>") }
  encode(dir: args[2], fps: Int32(args[3])!, out: args[4], bitrate: Int(args[5])!)
case "mux":
  guard args.count == 5 else { fail("vfvideo mux <video> <ton.wav> <aus.mp4>") }
  await mux(video: args[2], audio: args[3], out: args[4])
case "check":
  guard args.count >= 4 else { fail("vfvideo check <video> <ordner> [t…]") }
  await check(video: args[2], stills: args[3], times: args.dropFirst(4).compactMap(Double.init))
default:
  fail("Unbekannt: \(args[1])")
}
