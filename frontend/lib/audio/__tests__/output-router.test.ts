/**
 * Unit tests for `frontend/lib/audio/output-router.ts`.
 *
 * @see task-voice-C7-bluetooth-airpods-relay.md
 */

import {
  getNewOutputToastMessage,
  getOutputPromotionRank,
  isBluetoothDevice,
  isPreferredOutput,
  shouldOfferBluetoothRelayPrompt,
} from "../output-router";

function makeDevice(label: string, transport?: string): MediaDeviceInfo {
  const base = {
    deviceId: "d1",
    kind: "audiooutput" as const,
    label,
    groupId: "g",
    toJSON: () => ({}),
  };
  if (transport) {
    return { ...base, transport } as MediaDeviceInfo;
  }
  return base as MediaDeviceInfo;
}

describe("isBluetoothDevice", () => {
  it("matches AirPods and generic Bluetooth labels", () => {
    expect(isBluetoothDevice(makeDevice("Abhishek's AirPods Pro"))).toBe(true);
    expect(isBluetoothDevice(makeDevice("Bluetooth Audio"))).toBe(true);
    expect(isBluetoothDevice(makeDevice("Headset BT-900"))).toBe(true);
  });

  it("matches known BT brands with headphones in the label", () => {
    expect(isBluetoothDevice(makeDevice("Sony WH-1000XM5 Headphones"))).toBe(
      true,
    );
    expect(isBluetoothDevice(makeDevice("Galaxy Buds2 Pro"))).toBe(true);
  });

  it("uses transport when exposed by the browser", () => {
    expect(isBluetoothDevice(makeDevice("Output", "bluetooth"))).toBe(true);
  });

  it("returns false for built-in and wired USB outputs", () => {
    expect(isBluetoothDevice(makeDevice("Speaker — Built-in Audio"))).toBe(
      false,
    );
    expect(isBluetoothDevice(makeDevice("USB Headphones"))).toBe(false);
    expect(isBluetoothDevice(makeDevice("Default - Speakers"))).toBe(false);
  });
});

describe("isPreferredOutput", () => {
  const speaker = makeDevice("Built-in Speaker");
  const bt = makeDevice("AirPods Pro");
  const wired = makeDevice("USB Headphones");

  it("promotes Bluetooth over built-in speaker", () => {
    expect(isPreferredOutput(bt, speaker)).toBe(true);
    expect(isPreferredOutput(speaker, bt)).toBe(false);
  });

  it("promotes wired headphones over built-in", () => {
    expect(isPreferredOutput(wired, speaker)).toBe(true);
    expect(getOutputPromotionRank(wired)).toBe(2);
  });
});

describe("getNewOutputToastMessage", () => {
  it("uses AirPods copy when label matches", () => {
    expect(getNewOutputToastMessage(makeDevice("AirPods Max"))).toBe(
      "AirPods detected — switch?",
    );
  });

  it("uses generic Bluetooth copy otherwise", () => {
    expect(getNewOutputToastMessage(makeDevice("Bluetooth Headset"))).toBe(
      "Bluetooth headset detected — switch?",
    );
  });
});

describe("shouldOfferBluetoothRelayPrompt", () => {
  it("is false on iPhone user agents", () => {
    expect(
      shouldOfferBluetoothRelayPrompt(
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)",
      ),
    ).toBe(false);
  });

  it("is true on Android Chrome", () => {
    expect(
      shouldOfferBluetoothRelayPrompt(
        "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/120.0.0.0 Mobile",
      ),
    ).toBe(true);
  });
});
