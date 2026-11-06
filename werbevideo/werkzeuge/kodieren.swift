// Setzt die Einzelbilder und den Ton zu einer MP4-Datei zusammen (H.264 + AAC) – nur mit Bordmitteln von macOS
// (AVFoundation), ohne ffmpeg.
//
//   swiftc -O werbevideo/werkzeuge/kodieren.swift -o werbevideo/ausgabe/kodieren
//   werbevideo/ausgabe/kodieren <bilder-ordner> <ton.wav> <ziel.mp4> [bilder/s] [bitrate]
import AVFoundation
import CoreGraphics
import Foundation
import ImageIO

let args = CommandLine.arguments
guard args.count >= 4 else {
  print("Aufruf: kodieren <bilder-ordner> <ton.wav> <ziel.mp4> [bilder/s] [bitrate]")
  exit(1)
}
let framesDir = URL(fileURLWithPath: args[1])
let audioURL = URL(fileURLWithPath: args[2])
let outURL = URL(fileURLWithPath: args[3])
let fps = Int32(args.count > 4 ? args[4] : "30") ?? 30
let bitrate = Int(args.count > 5 ? args[5] : "14000000") ?? 14_000_000

let files = try FileManager.default.contentsOfDirectory(atPath: framesDir.path)
  .filter { $0.hasSuffix(".jpg") || $0.hasSuffix(".png") }
  .sorted()
guard let first = files.first else {
  print("Keine Bilder in \(framesDir.path)")
  exit(1)
}

func loadImage(_ name: String) -> CGImage {
  let src = CGImageSourceCreateWithURL(framesDir.appendingPathComponent(name) as CFURL, nil)!
  return CGImageSourceCreateImageAtIndex(src, 0, nil)!
}
let probe = loadImage(first)
let width = probe.width
let height = probe.height

try? FileManager.default.removeItem(at: outURL)
let writer = try AVAssetWriter(outputURL: outURL, fileType: .mp4)
writer.shouldOptimizeForNetworkUse = true

let videoInput = AVAssetWriterInput(mediaType: .video, outputSettings: [
  AVVideoCodecKey: AVVideoCodecType.h264,
  AVVideoWidthKey: width,
  AVVideoHeightKey: height,
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
  ],
])
videoInput.expectsMediaDataInRealTime = false
let adaptor = AVAssetWriterInputPixelBufferAdaptor(assetWriterInput: videoInput, sourcePixelBufferAttributes: [
  kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA,
  kCVPixelBufferWidthKey as String: width,
  kCVPixelBufferHeightKey as String: height,
  kCVPixelBufferCGImageCompatibilityKey as String: true,
  kCVPixelBufferCGBitmapContextCompatibilityKey as String: true,
])
writer.add(videoInput)

let asset = AVURLAsset(url: audioURL)
let audioTrack = asset.tracks(withMediaType: .audio).first!
let reader = try AVAssetReader(asset: asset)
let audioOutput = AVAssetReaderTrackOutput(track: audioTrack, outputSettings: [
  AVFormatIDKey: kAudioFormatLinearPCM,
  AVLinearPCMBitDepthKey: 16,
  AVLinearPCMIsFloatKey: false,
  AVLinearPCMIsBigEndianKey: false,
  AVLinearPCMIsNonInterleaved: false,
])
reader.add(audioOutput)
let audioInput = AVAssetWriterInput(mediaType: .audio, outputSettings: [
  AVFormatIDKey: kAudioFormatMPEG4AAC,
  AVNumberOfChannelsKey: 2,
  AVSampleRateKey: 48000,
  AVEncoderBitRateKey: 256_000,
])
audioInput.expectsMediaDataInRealTime = false
writer.add(audioInput)

guard writer.startWriting(), reader.startReading() else {
  print("Start fehlgeschlagen: \(String(describing: writer.error ?? reader.error))")
  exit(1)
}
writer.startSession(atSourceTime: .zero)

let colorSpace = CGColorSpace(name: CGColorSpace.sRGB)!
let group = DispatchGroup()
var frameIndex = 0
group.enter()
videoInput.requestMediaDataWhenReady(on: DispatchQueue(label: "bild")) {
  while videoInput.isReadyForMoreMediaData {
    if frameIndex >= files.count {
      videoInput.markAsFinished()
      group.leave()
      return
    }
    autoreleasepool {
      let image = loadImage(files[frameIndex])
      var buffer: CVPixelBuffer?
      CVPixelBufferPoolCreatePixelBuffer(nil, adaptor.pixelBufferPool!, &buffer)
      let pb = buffer!
      CVPixelBufferLockBaseAddress(pb, [])
      let ctx = CGContext(
        data: CVPixelBufferGetBaseAddress(pb), width: width, height: height, bitsPerComponent: 8,
        bytesPerRow: CVPixelBufferGetBytesPerRow(pb), space: colorSpace,
        bitmapInfo: CGImageAlphaInfo.premultipliedFirst.rawValue | CGBitmapInfo.byteOrder32Little.rawValue)!
      ctx.draw(image, in: CGRect(x: 0, y: 0, width: width, height: height))
      CVPixelBufferUnlockBaseAddress(pb, [])
      adaptor.append(pb, withPresentationTime: CMTime(value: CMTimeValue(frameIndex), timescale: fps))
      frameIndex += 1
      if frameIndex % 300 == 0 { print("Bild \(frameIndex)/\(files.count)") }
    }
  }
}
group.enter()
audioInput.requestMediaDataWhenReady(on: DispatchQueue(label: "ton")) {
  while audioInput.isReadyForMoreMediaData {
    if let sample = audioOutput.copyNextSampleBuffer() {
      audioInput.append(sample)
    } else {
      audioInput.markAsFinished()
      group.leave()
      return
    }
  }
}
group.wait()
let done = DispatchSemaphore(value: 0)
writer.finishWriting { done.signal() }
done.wait()
if writer.status == .completed {
  print("✔ \(outURL.path) (\(files.count) Bilder, \(width)×\(height))")
} else {
  print("Fehler: \(String(describing: writer.error))")
  exit(1)
}
