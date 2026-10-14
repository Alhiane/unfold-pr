<?php
use Illuminate\Support\Facades\Route;

Route::get('ping', fn () => 'pong');

Route::middleware('auth')->group(static function (): void {
    Route::post('me/sessions/logout-others', LogOutOtherSessionsController::class);
});
