// src/app/core/services/sound.service.ts
import { Injectable } from '@angular/core';

interface SoundEffect {
  key: string;
  path: string;
  audio?: HTMLAudioElement; // To store the loaded audio element
  volume?: number;
}

@Injectable({
  providedIn: 'root'
})
export class SoundService {
  private soundsEnabledGlobally = true; // Can be controlled by a global app setting later if needed
  private soundEffects: SoundEffect[] = [
    { key: 'correct', path: 'assets/sounds/smb_coin.wav', volume: 0.7 }, // Optional
    { key: 'incorrect', path: 'assets/sounds/smb_mariodie.wav', volume: 0.7 }, // Optional
    { key: 'streak1', path: 'assets/sounds/sound_AQS_firstblood.wav', volume: 0.8 },
    { key: 'streak2', path: 'assets/sounds/sound_AQS_unstoppable.wav', volume: 0.8 },
    { key: 'streak3', path: 'assets/sounds/sound_AQS_godlike.wav', volume: 1.0 },
    { key: 'done', path: 'assets/sounds/smb_stage_clear.wav', volume: 1.0 },
    { key: 'fail', path: 'assets/sounds/smb_gameover.wav', volume: 1.0 },
    { key: 'warning', path: 'assets/sounds/smb_warning.wav', volume: 1.0 },
    // Add more sounds as needed
  ];

  private activeAudio: HTMLAudioElement | null = null; // To stop previous sound if a new one plays quickly

  constructor() {
    this.preloadSounds();
  }

  private preloadSounds(): void {
    this.soundEffects.forEach(effect => {
      effect.audio = new Audio(effect.path);
      effect.audio.load(); // Preload the audio file
      if (effect.volume !== undefined) {
        effect.audio.volume = effect.volume;
      }
    });
  }

  public play(key: string, forcePlay: boolean = false): void {
    if (!this.soundsEnabledGlobally && !forcePlay) {
      // console.log('Sounds are globally disabled.');
      return;
    }

    const soundEffect = this.soundEffects.find(s => s.key === key);
    if (soundEffect && soundEffect.audio) {
      // Stop any currently playing sound from this service to prevent overlap
      if (this.activeAudio && !this.activeAudio.paused) {
        this.activeAudio.pause();
        this.activeAudio.currentTime = 0; // Rewind
      }

      soundEffect.audio.currentTime = 0; // Rewind to start
      soundEffect.audio.play().catch(error => console.error(`Error playing sound ${key}:`, error));
      this.activeAudio = soundEffect.audio;
    } else {
      console.warn(`Sound effect with key "${key}" not found or not loaded.`);
    }
  }

  // Call this from your app settings or quiz setup
  public setSoundsEnabled(enabled: boolean): void {
    this.soundsEnabledGlobally = enabled;
    if (!enabled && this.activeAudio) {
        this.activeAudio.pause();
        this.activeAudio.currentTime = 0;
        this.activeAudio = null;
    }
  }

  public areSoundsEnabled(): boolean {
    return this.soundsEnabledGlobally;
  }
}